import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type {
  DevelopmentStore,
  KnowledgeEntryRecord,
  ListFilters,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { canTransition, type TransitionGraph } from '../../core/workflow/state-machine.js';

export type KnowledgeEntryType = KnowledgeEntryRecord['type'];
export type KnowledgeEntryStatus = 'draft' | 'published' | 'archived';

export interface KnowledgeEntryInput {
  type: KnowledgeEntryType;
  title: string;
  body: string;
  status: KnowledgeEntryStatus;
  scope: ScopeRef;
}

export type KnowledgeEntryPatch = Partial<Omit<KnowledgeEntryInput, 'status'>>;

export interface KnowledgeEntryFilters extends ListFilters {
  type?: KnowledgeEntryType;
}

const KNOWLEDGE_TRANSITIONS: TransitionGraph<KnowledgeEntryStatus> = {
  draft: ['published'],
  published: ['draft', 'archived'],
  archived: [],
};

type TransitionResult =
  | { kind: 'missing' }
  | {
      kind: 'rejected';
      from: KnowledgeEntryStatus;
      to: KnowledgeEntryStatus;
      scope: ScopeRef;
    }
  | { kind: 'updated'; entry: KnowledgeEntryRecord };

function repositoryFilters(filters: KnowledgeEntryFilters): ListFilters {
  return {
    status: filters.status,
    scopeType: filters.scopeType,
    scopeId: filters.scopeId,
    query: filters.query,
  };
}

function permitted(actor: AuthorizationContext, action: string, scope: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'knowledge_entry', scope }).allowed;
}

function knowledgeStatus(value: string): KnowledgeEntryStatus | null {
  return value === 'draft' || value === 'published' || value === 'archived' ? value : null;
}

export class KnowledgeService {
  constructor(private readonly store: DevelopmentStore) {}

  async list(filters: KnowledgeEntryFilters, publicOnly: boolean): Promise<KnowledgeEntryRecord[]> {
    if (publicOnly && filters.status !== undefined && filters.status !== 'published') return [];
    if (publicOnly && filters.scopeType !== undefined && filters.scopeType !== 'public') return [];
    if (publicOnly && filters.scopeId !== undefined && filters.scopeId !== '*') return [];
    const applied: KnowledgeEntryFilters = publicOnly
      ? { ...filters, status: 'published', scopeType: 'public', scopeId: '*' }
      : filters;
    const records = await this.store.knowledge.list(repositoryFilters(applied));
    return records.filter((entry) => applied.type === undefined || entry.type === applied.type);
  }

  async create(actorUid: string, input: KnowledgeEntryInput): Promise<KnowledgeEntryRecord> {
    return this.store.transaction(async (transactionStore) => {
      const created = await transactionStore.knowledge.create({
        ...input,
        ownerUid: actorUid,
      });
      if (input.status !== 'draft') {
        await recordAuditEvent(transactionStore, {
          actorUid,
          action: 'knowledge.entry.publish',
          resourceType: 'knowledge_entry',
          resourceId: created.id,
          details: { from: null, to: input.status, outcome: 'accepted', scope: created.scope },
        });
      }
      return created;
    });
  }

  async update(
    actor: AuthorizationContext,
    id: string,
    patch: KnowledgeEntryPatch,
  ): Promise<KnowledgeEntryRecord | null> {
    return this.store.transaction(async (transactionStore) => {
      const current = await transactionStore.knowledge.getForUpdate(id);
      if (current === null) return null;
      const targetScope = patch.scope ?? current.scope;
      if (
        !permitted(actor, 'knowledge.create', current.scope) ||
        !permitted(actor, 'knowledge.create', targetScope)
      ) {
        throw new HttpError(404, 'knowledge_entry_not_found', 'Entry not found');
      }
      if (
        current.status === 'published' &&
        (!permitted(actor, 'knowledge.publish', current.scope) ||
          !permitted(actor, 'knowledge.publish', targetScope))
      ) {
        throw new HttpError(404, 'knowledge_entry_not_found', 'Entry not found');
      }
      const updated = await transactionStore.knowledge.update(id, patch);
      if (updated === null) return null;
      await recordAuditEvent(transactionStore, {
        actorUid: actor.uid,
        action: 'knowledge.entry.update',
        resourceType: 'knowledge_entry',
        resourceId: id,
        details: {
          fields: Object.keys(patch).sort(),
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
    to: KnowledgeEntryStatus,
  ): Promise<KnowledgeEntryRecord | null> {
    const result = await this.store.transaction<TransitionResult>(async (transactionStore) => {
      const current = await transactionStore.knowledge.getForUpdate(id);
      if (current === null) return { kind: 'missing' };
      if (!permitted(actor, 'knowledge.publish', current.scope)) {
        throw new HttpError(404, 'knowledge_entry_not_found', 'Entry not found');
      }
      const from = knowledgeStatus(current.status);
      if (from === null || !canTransition(KNOWLEDGE_TRANSITIONS, from, to)) {
        return {
          kind: 'rejected',
          from: from ?? (current.status as KnowledgeEntryStatus),
          to,
          scope: current.scope,
        };
      }
      const updated = await transactionStore.knowledge.update(id, { status: to });
      if (updated === null) return { kind: 'missing' };
      await recordAuditEvent(transactionStore, {
        actorUid: actor.uid,
        action: 'knowledge.entry.publish',
        resourceType: 'knowledge_entry',
        resourceId: id,
        details: { from, to, outcome: 'accepted', scope: updated.scope },
      });
      return { kind: 'updated', entry: updated };
    });

    if (result.kind === 'missing') return null;
    if (result.kind === 'rejected') {
      await recordAuditEvent(this.store, {
        actorUid: actor.uid,
        action: 'knowledge.entry.publish',
        resourceType: 'knowledge_entry',
        resourceId: id,
        details: {
          from: result.from,
          to: result.to,
          outcome: 'rejected',
          scope: result.scope,
        },
      });
      throw new HttpError(409, 'invalid_state_transition', 'Invalid knowledge state transition');
    }
    return result.entry;
  }
}
