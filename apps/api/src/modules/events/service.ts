import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type {
  ActivityRecord,
  ActivityRegistrationRecord,
  DevelopmentStore,
  ListFilters,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

export type ActivityStatus = 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
export interface ActivityInput {
  title: string;
  description: string;
  clubId: string | null;
  startsAt: string | null;
  status: ActivityStatus;
  scope: ScopeRef;
}
export type ActivityPatch = Partial<ActivityInput>;

function can(actor: AuthorizationContext, action: string, scope: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'activity', scope }).allowed;
}
function canRegistration(actor: AuthorizationContext, action: string, scope: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'activity_registration', scope }).allowed;
}

function activityNotFound(): HttpError {
  return new HttpError(404, 'activity_not_found', 'Activity not found');
}

export class EventsService {
  constructor(private readonly store: DevelopmentStore) {}

  async list(actor: AuthorizationContext, filters: ListFilters): Promise<ActivityRecord[]> {
    const records = await this.store.activities.list(filters);
    return records.filter((record) => can(actor, 'events.read', record.scope));
  }

  async create(actor: AuthorizationContext, input: ActivityInput): Promise<ActivityRecord> {
    return this.store.transaction(async (store) => {
      const created = await store.activities.create({ ...input, ownerUid: actor.uid });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'events.activity.created',
        resourceType: 'activity',
        resourceId: created.id,
        details: { status: created.status, scope: created.scope },
      });
      return created;
    });
  }

  async update(
    actor: AuthorizationContext,
    id: string,
    patch: ActivityPatch,
  ): Promise<ActivityRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.activities.getForUpdate(id);
      if (current === null || !can(actor, 'events.update', current.scope)) {
        throw activityNotFound();
      }
      const targetScope = patch.scope ?? current.scope;
      if (!can(actor, 'events.update', targetScope)) throw activityNotFound();
      const updated = await store.activities.update(id, patch);
      if (updated === null) throw activityNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action:
          patch.status !== undefined && patch.status !== current.status
            ? 'events.activity.status_changed'
            : 'events.activity.updated',
        resourceType: 'activity',
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

  async register(
    actor: AuthorizationContext,
    activityId: string,
  ): Promise<ActivityRegistrationRecord> {
    return this.store.transaction(async (store) => {
      const activity = await store.activities.getForUpdate(activityId);
      const routeScope = { type: 'activity', id: activityId } as const;
      if (activity === null || !canRegistration(actor, 'events.register', routeScope)) {
        throw activityNotFound();
      }
      if (activity.status !== 'open') {
        throw new HttpError(409, 'activity_not_open', 'Activity is not open for registration');
      }
      const registration = await store.activityRegistrations.create({
        activityId,
        participantUid: actor.uid,
        status: 'registered',
        ownerUid: actor.uid,
        scope: routeScope,
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'events.registration.created',
        resourceType: 'activity_registration',
        resourceId: registration.id,
        details: { activityId },
      });
      return registration;
    });
  }

  async cancel(actor: AuthorizationContext, activityId: string): Promise<void> {
    await this.store.transaction(async (store) => {
      const activity = await store.activities.getForUpdate(activityId);
      const routeScope = { type: 'activity', id: activityId } as const;
      if (activity === null || !canRegistration(actor, 'events.cancel_registration', routeScope)) {
        throw activityNotFound();
      }
      const registration = (await store.activityRegistrations.list({ query: activityId })).find(
        (record) => record.activityId === activityId && record.participantUid === actor.uid,
      );
      if (registration === undefined) {
        throw new HttpError(404, 'activity_registration_not_found', 'Registration not found');
      }
      await store.activityRegistrations.delete(registration.id);
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'events.registration.cancelled',
        resourceType: 'activity_registration',
        resourceId: registration.id,
        details: { activityId },
      });
    });
  }
}
