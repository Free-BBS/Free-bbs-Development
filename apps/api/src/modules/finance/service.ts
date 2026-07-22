import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore, FinanceRecord, ListFilters } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

export type FinanceStatus = 'draft' | 'submitted' | 'approved' | 'settled' | 'rejected';
export interface FinanceInput {
  title: string;
  kind: 'budget' | 'settlement';
  amountCents: number;
  activityId: string | null;
  status: FinanceStatus;
  scope: ScopeRef;
}
export type FinancePatch = Partial<FinanceInput>;

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

function assertActivityScope(activityId: string | null, scope: ScopeRef): void {
  if (activityId !== null && (scope.type !== 'activity' || scope.id !== activityId)) {
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
      const created = await store.financeRecords.create({ ...input, ownerUid: actor.uid });
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
      if (current === null || !can(actor, 'finance.record.update', current.scope)) {
        throw financeNotFound();
      }
      const targetScope = patch.scope ?? current.scope;
      if (!can(actor, 'finance.record.update', targetScope)) throw financeNotFound();
      if (
        patch.status === 'approved' &&
        (!can(actor, 'finance.record.approve', current.scope) ||
          !can(actor, 'finance.record.approve', targetScope))
      ) {
        throw financeNotFound();
      }
      const targetActivityId =
        patch.activityId === undefined ? (current.activityId ?? null) : patch.activityId;
      assertActivityScope(targetActivityId, targetScope);
      if (targetActivityId !== null) {
        const activity = await store.activities.getForUpdate(targetActivityId);
        if (activity === null) throw new HttpError(404, 'activity_not_found', 'Activity not found');
      }
      const updated = await store.financeRecords.update(id, patch);
      if (updated === null) throw financeNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action:
          patch.status !== undefined && patch.status !== current.status
            ? 'finance.record.status_changed'
            : 'finance.record.updated',
        resourceType: 'finance_record',
        resourceId: id,
        details: {
          changedFields: Object.keys(patch).sort(),
          fromStatus: current.status,
          toStatus: updated.status,
          fromScope: current.scope,
          toScope: updated.scope,
        },
      });
      return updated;
    });
  }
}
