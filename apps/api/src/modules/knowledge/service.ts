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

export type KnowledgeEntryType = KnowledgeEntryRecord['type'];
export type KnowledgeEntryStatus = 'draft' | 'published' | 'archived';

export interface KnowledgeEntryInput {
  type: KnowledgeEntryType;
  title: string;
  body: string;
  status: KnowledgeEntryStatus;
  scope: ScopeRef;
}

export type KnowledgeEntryPatch = Partial<KnowledgeEntryInput>;

export interface KnowledgeEntryFilters extends ListFilters {
  type?: KnowledgeEntryType;
}

function repositoryFilters(filters: KnowledgeEntryFilters): ListFilters {
  return {
    status: filters.status,
    scopeType: filters.scopeType,
    scopeId: filters.scopeId,
    query: filters.query,
  };
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
          action: 'knowledge.entry.status_changed',
          resourceType: 'knowledge_entry',
          resourceId: created.id,
          details: { from: null, to: input.status, scope: created.scope },
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
      const current = await transactionStore.knowledge.get(id);
      if (current === null) return null;
      const targetScope = patch.scope ?? current.scope;
      const contentChanged =
        patch.type !== undefined ||
        patch.title !== undefined ||
        patch.body !== undefined ||
        patch.scope !== undefined;
      const permitted = (action: string, scope: ScopeRef) =>
        authorize(actor, { action, resource: 'knowledge_entry', scope }).allowed;
      if (
        contentChanged &&
        (!permitted('knowledge.create', current.scope) ||
          !permitted('knowledge.create', targetScope))
      ) {
        throw new HttpError(404, 'knowledge_entry_not_found', 'Entry not found');
      }
      if (
        (patch.status !== undefined || (contentChanged && current.status === 'published')) &&
        (!permitted('knowledge.publish', current.scope) ||
          !permitted('knowledge.publish', targetScope))
      ) {
        throw new HttpError(404, 'knowledge_entry_not_found', 'Entry not found');
      }
      const updated = await transactionStore.knowledge.update(id, patch);
      if (updated === null) return null;
      if (patch.status !== undefined && patch.status !== current.status) {
        await recordAuditEvent(transactionStore, {
          actorUid: actor.uid,
          action: 'knowledge.entry.status_changed',
          resourceType: 'knowledge_entry',
          resourceId: id,
          details: { from: current.status, to: patch.status, scope: updated.scope },
        });
      }
      return updated;
    });
  }
}
