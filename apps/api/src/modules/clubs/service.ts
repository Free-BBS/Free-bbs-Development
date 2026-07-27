import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type {
  ClubMembershipRecord,
  ClubRecord,
  DevelopmentStore,
  ListFilters,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

export type ClubStatus = 'draft' | 'active' | 'archived';
export interface ClubInput {
  name: string;
  description: string;
  status: ClubStatus;
  scope: ScopeRef;
}
export type ClubPatch = Partial<ClubInput>;

function can(actor: AuthorizationContext, action: string, scope: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'club', scope }).allowed;
}
function canMembership(actor: AuthorizationContext, action: string, scope: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'club_membership', scope }).allowed;
}

function clubNotFound(): HttpError {
  return new HttpError(404, 'club_not_found', 'Club not found');
}

export class ClubsService {
  constructor(private readonly store: DevelopmentStore) {}

  async list(actor: AuthorizationContext, filters: ListFilters): Promise<ClubRecord[]> {
    const records = await this.store.clubs.list(filters);
    return records.filter((record) => can(actor, 'clubs.read', record.scope));
  }

  async create(actor: AuthorizationContext, input: ClubInput): Promise<ClubRecord> {
    return this.store.transaction(async (store) => {
      const created = await store.clubs.create({
        ...input,
        technicalSupportStatus: 'not_requested',
        technicalSupportNote: null,
        ownerUid: actor.uid,
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'clubs.club.created',
        resourceType: 'club',
        resourceId: created.id,
        details: { status: created.status, scope: created.scope },
      });
      return created;
    });
  }

  async update(actor: AuthorizationContext, id: string, patch: ClubPatch): Promise<ClubRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.clubs.getForUpdate(id);
      if (current === null || !can(actor, 'clubs.update', current.scope)) throw clubNotFound();
      const targetScope = patch.scope ?? current.scope;
      if (!can(actor, 'clubs.update', targetScope)) throw clubNotFound();
      const updated = await store.clubs.update(id, patch);
      if (updated === null) throw clubNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action:
          patch.status !== undefined && patch.status !== current.status
            ? 'clubs.club.status_changed'
            : 'clubs.club.updated',
        resourceType: 'club',
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

  async join(actor: AuthorizationContext, clubId: string): Promise<ClubMembershipRecord> {
    return this.store.transaction(async (store) => {
      const club = await store.clubs.getForUpdate(clubId);
      if (club === null || !canMembership(actor, 'clubs.join', { type: 'club', id: clubId })) {
        throw clubNotFound();
      }
      if (club.status !== 'active') {
        throw new HttpError(409, 'club_not_active', 'Club is not accepting members');
      }
      const membership = await store.clubMemberships.create({
        clubId,
        memberUid: actor.uid,
        status: 'active',
        ownerUid: actor.uid,
        scope: { type: 'club', id: clubId },
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'clubs.membership.joined',
        resourceType: 'club_membership',
        resourceId: membership.id,
        details: { clubId },
      });
      return membership;
    });
  }

  async leave(actor: AuthorizationContext, clubId: string): Promise<void> {
    await this.store.transaction(async (store) => {
      const club = await store.clubs.getForUpdate(clubId);
      if (club === null || !canMembership(actor, 'clubs.leave', { type: 'club', id: clubId })) {
        throw clubNotFound();
      }
      const membership = (await store.clubMemberships.list({ query: clubId })).find(
        (record) => record.clubId === clubId && record.memberUid === actor.uid,
      );
      if (membership === undefined) {
        throw new HttpError(404, 'club_membership_not_found', 'Club membership not found');
      }
      await store.clubMemberships.delete(membership.id);
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'clubs.membership.left',
        resourceType: 'club_membership',
        resourceId: membership.id,
        details: { clubId },
      });
    });
  }
}
