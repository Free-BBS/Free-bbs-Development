import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type {
  DevelopmentStore,
  ListFilters,
  SportsCheckinRecord,
  SportsTeamRecord,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

export type SportsTeamStatus = 'draft' | 'active' | 'archived';
export interface SportsTeamInput {
  name: string;
  description: string;
  status: SportsTeamStatus;
}
export type SportsTeamPatch = Partial<SportsTeamInput>;
export interface SportsCheckinInput {
  memberUid: string;
  checkinDate: string;
}
export interface SportsCheckinResult {
  record: SportsCheckinRecord;
  created: boolean;
}

function teamScope(teamId: string): ScopeRef {
  return { type: 'sports_team', id: teamId };
}

function canTeam(actor: AuthorizationContext, action: string, scope?: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'sports_team', scope }).allowed;
}

function canCheckin(actor: AuthorizationContext, action: string, scope: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'sports_checkin', scope }).allowed;
}

function teamNotFound(): HttpError {
  return new HttpError(404, 'sports_team_not_found', 'Sports team not found');
}

export class SportsService {
  constructor(private readonly store: DevelopmentStore) {}

  async listTeams(actor: AuthorizationContext, filters: ListFilters): Promise<SportsTeamRecord[]> {
    const records = await this.store.sportsTeams.list(filters);
    return records.filter(
      (record) =>
        record.scope.type === 'sports_team' &&
        record.scope.id === record.id &&
        canTeam(actor, 'sports.team.read', record.scope) &&
        (record.status === 'active' || canTeam(actor, 'sports.team.update', record.scope)),
    );
  }

  async createTeam(actor: AuthorizationContext, input: SportsTeamInput): Promise<SportsTeamRecord> {
    return this.store.transaction(async (store) => {
      const created = await store.sportsTeams.create({
        ...input,
        ownerUid: actor.uid,
        scope: { type: 'sports_team', id: 'pending' },
      });
      const canonical = await store.sportsTeams.update(created.id, {
        scope: teamScope(created.id),
      });
      if (canonical === null) throw new Error('Failed to canonicalize created sports team');
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'sports.team.created',
        resourceType: 'sports_team',
        resourceId: canonical.id,
        details: { status: canonical.status },
      });
      return canonical;
    });
  }

  async updateTeam(
    actor: AuthorizationContext,
    id: string,
    patch: SportsTeamPatch,
  ): Promise<SportsTeamRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.sportsTeams.getForUpdate(id);
      if (
        current === null ||
        current.scope.type !== 'sports_team' ||
        current.scope.id !== id ||
        !canTeam(actor, 'sports.team.update', current.scope)
      ) {
        throw teamNotFound();
      }
      const updated = await store.sportsTeams.update(id, patch);
      if (updated === null) throw teamNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action:
          patch.status !== undefined && patch.status !== current.status
            ? 'sports.team.status_changed'
            : 'sports.team.updated',
        resourceType: 'sports_team',
        resourceId: id,
        details: {
          changedFields: Object.keys(patch).sort(),
          fromStatus: current.status,
          toStatus: updated.status,
        },
      });
      return updated;
    });
  }

  async listCheckins(actor: AuthorizationContext, teamId: string): Promise<SportsCheckinRecord[]> {
    const routeScope = teamScope(teamId);
    if (!canCheckin(actor, 'sports.checkin.read', routeScope)) throw teamNotFound();
    const team = await this.store.sportsTeams.get(teamId);
    if (team === null || team.scope.type !== routeScope.type || team.scope.id !== routeScope.id) {
      throw teamNotFound();
    }
    return (await this.store.sportsCheckins.list({ query: teamId })).filter(
      (record) =>
        record.teamId === teamId &&
        record.scope.type === routeScope.type &&
        record.scope.id === routeScope.id,
    );
  }

  async createCheckin(
    actor: AuthorizationContext,
    teamId: string,
    input: SportsCheckinInput,
  ): Promise<SportsCheckinResult> {
    return this.store.transaction(async (store) => {
      const routeScope = teamScope(teamId);
      const team = await store.sportsTeams.getForUpdate(teamId);
      if (
        team === null ||
        team.scope.type !== routeScope.type ||
        team.scope.id !== routeScope.id ||
        !canCheckin(actor, 'sports.checkin.create', routeScope)
      ) {
        throw teamNotFound();
      }
      const existing = (await store.sportsCheckins.list({ query: teamId })).find(
        (record) =>
          record.teamId === teamId &&
          record.memberUid === input.memberUid &&
          record.checkinDate === input.checkinDate,
      );
      if (
        existing !== undefined &&
        (existing.scope.type !== routeScope.type || existing.scope.id !== routeScope.id)
      ) {
        throw teamNotFound();
      }
      if (existing !== undefined) return { record: existing, created: false };

      const record = await store.sportsCheckins.create({
        teamId,
        memberUid: input.memberUid,
        checkinDate: input.checkinDate,
        status: 'present',
        ownerUid: actor.uid,
        scope: routeScope,
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'sports.checkin.created',
        resourceType: 'sports_checkin',
        resourceId: record.id,
        details: { teamId },
      });
      return { record, created: true };
    });
  }
}
