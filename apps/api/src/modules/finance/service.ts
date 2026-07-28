import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import { loadAuthorizationContext } from '../../core/authorization/load-authorization-context.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore, FinanceRecord, ListFilters } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { canTransition } from '../../core/workflow/state-machine.js';

export type FinanceStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';
export interface FinanceInput {
  title: string;
  kind: 'budget' | 'settlement';
  amountCents: number;
  activityId: string | null;
  status: 'draft';
  scope: ScopeRef;
}
export type FinancePatch = Partial<Omit<FinanceInput, 'status'>>;

const FINANCE_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['archived'],
  rejected: ['draft', 'archived'],
  archived: [],
} as const;

type TransitionResult =
  | { kind: 'missing' }
  | { kind: 'updated'; record: FinanceRecord }
  | { kind: 'rejected'; from: string; to: string; scope: ScopeRef };

function can(actor: AuthorizationContext, action: string, scope?: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'finance_record', scope }).allowed;
}

function matchesPattern(pattern: string, value: string): boolean {
  return (
    pattern === '*' ||
    pattern === value ||
    (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)))
  );
}

function hasScopedReadGrant(actor: AuthorizationContext): boolean {
  return (actor.policies ?? []).some(
    (policy) =>
      policy.scope !== undefined &&
      policy.effect === 'allow' &&
      matchesPattern(policy.action, 'finance.record.read') &&
      matchesPattern(policy.resource, 'finance_record') &&
      can(actor, 'finance.record.read', policy.scope),
  );
}

function financeNotFound(): HttpError {
  return new HttpError(404, 'finance_record_not_found', 'Finance record not found');
}

function financeForbidden(): HttpError {
  return new HttpError(403, 'forbidden', 'Explicit finance permission is required');
}

function canMaintain(
  actor: AuthorizationContext,
  record: FinanceRecord,
  targetScope: ScopeRef = record.scope,
): boolean {
  const manager =
    can(actor, 'finance.record.update', record.scope) &&
    can(actor, 'finance.record.update', targetScope);
  const creator =
    record.ownerUid === actor.uid &&
    can(actor, 'finance.record.create', record.scope) &&
    can(actor, 'finance.record.create', targetScope);
  return manager || creator;
}

function assertActivityScope(activityId: string | null, scope: ScopeRef): void {
  const activityScoped = scope.type === 'activity';
  if (
    (activityId === null && activityScoped) ||
    (activityId !== null && (!activityScoped || scope.id !== activityId))
  ) {
    throw new HttpError(400, 'invalid_activity_scope', 'Linked activity and scope do not match');
  }
}

export class FinanceService {
  constructor(private readonly store: DevelopmentStore) {}

  async list(
    actor: AuthorizationContext,
    filters: ListFilters,
  ): Promise<{ authorized: boolean; records: FinanceRecord[] }> {
    const candidates = await this.store.financeRecords.list(filters);
    const records = candidates.filter((record) => can(actor, 'finance.record.read', record.scope));
    const requestedScope =
      filters.scopeType === undefined || filters.scopeId === undefined
        ? undefined
        : { type: filters.scopeType, id: filters.scopeId };
    return {
      authorized:
        requestedScope === undefined
          ? can(actor, 'finance.record.read') || hasScopedReadGrant(actor)
          : can(actor, 'finance.record.read', requestedScope),
      records,
    };
  }

  async create(actor: AuthorizationContext, input: FinanceInput): Promise<FinanceRecord> {
    return this.store.transaction(async (store) => {
      assertActivityScope(input.activityId, input.scope);
      if (input.activityId !== null) {
        const activity = await store.activities.getForUpdate(input.activityId);
        if (activity === null) throw new HttpError(404, 'activity_not_found', 'Activity not found');
      }
      const freshActor = await loadAuthorizationContext(store, actor, new Date());
      if (!can(freshActor, 'finance.record.create', input.scope)) throw financeForbidden();
      const created = await store.financeRecords.create({
        ...input,
        status: 'draft',
        ownerUid: actor.uid,
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'finance.record.created',
        resourceType: 'finance_record',
        resourceId: created.id,
        details: {
          kind: created.kind,
          status: created.status,
          scope: created.scope,
          activityLinked: created.activityId !== null,
        },
      });
      return created;
    });
  }

  async update(
    actor: AuthorizationContext,
    id: string,
    patch: FinancePatch,
  ): Promise<FinanceRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.financeRecords.getForUpdate(id);
      if (current === null) throw financeNotFound();
      const targetScope = patch.scope ?? current.scope;
      let freshActor = await loadAuthorizationContext(store, actor, new Date());
      if (current.status !== 'draft' || !canMaintain(freshActor, current, targetScope)) {
        throw financeNotFound();
      }
      const targetActivityId =
        patch.activityId === undefined ? (current.activityId ?? null) : patch.activityId;
      assertActivityScope(targetActivityId, targetScope);
      if (targetActivityId !== null) {
        const activity = await store.activities.getForUpdate(targetActivityId);
        if (activity === null) throw new HttpError(404, 'activity_not_found', 'Activity not found');
        freshActor = await loadAuthorizationContext(store, actor, new Date());
        if (!canMaintain(freshActor, current, targetScope)) throw financeNotFound();
      }
      const updated = await store.financeRecords.update(id, patch);
      if (updated === null) throw financeNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'finance.record.updated',
        resourceType: 'finance_record',
        resourceId: id,
        details: {
          changedFields: Object.keys(patch).sort(),
          fromScope: current.scope,
          toScope: updated.scope,
        },
      });
      return updated;
    });
  }

  async transition(
    actor: AuthorizationContext,
    id: string,
    to: FinanceStatus,
  ): Promise<FinanceRecord> {
    const result = await this.store.transaction<TransitionResult>(async (store) => {
      const current = await store.financeRecords.getForUpdate(id);
      if (current === null) return { kind: 'missing' };
      const freshActor = await loadAuthorizationContext(store, actor, new Date());
      const from = current.status as FinanceStatus;
      const approvalEdge = from === 'submitted' && (to === 'approved' || to === 'rejected');
      const creatorEdge =
        (from === 'draft' && to === 'submitted') || (from === 'rejected' && to === 'draft');
      const permitted = approvalEdge
        ? can(freshActor, 'finance.record.approve', current.scope)
        : creatorEdge
          ? canMaintain(freshActor, current)
          : can(freshActor, 'finance.record.update', current.scope);
      if (!permitted) return { kind: 'missing' };
      if (
        !Object.hasOwn(FINANCE_TRANSITIONS, from) ||
        !canTransition(FINANCE_TRANSITIONS, from, to)
      ) {
        return { kind: 'rejected', from, to, scope: current.scope };
      }
      const updated = await store.financeRecords.update(id, { status: to });
      if (updated === null) return { kind: 'missing' };
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'finance.record.status_changed',
        resourceType: 'finance_record',
        resourceId: id,
        details: { from, to, outcome: 'accepted', scope: updated.scope },
      });
      return { kind: 'updated', record: updated };
    });
    if (result.kind === 'missing') throw financeNotFound();
    if (result.kind === 'rejected') {
      await recordAuditEvent(this.store, {
        actorUid: actor.uid,
        action: 'finance.record.status_changed',
        resourceType: 'finance_record',
        resourceId: id,
        details: { from: result.from, to: result.to, outcome: 'rejected', scope: result.scope },
      });
      throw new HttpError(409, 'invalid_state_transition', 'Invalid finance state transition');
    }
    return result.record;
  }
}
