import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { createMemoryStore } from '../../core/database/memory-store.js';
import type { DevelopmentStore } from '../../core/database/types.js';

function scopedActor(scopeIds: string[]): AuthorizationContext {
  return {
    uid: 'event-maintainer',
    displayName: 'Event maintainer',
    avatarUrl: null,
    baseRole: 'student',
    roles: [],
    tags: [],
    policies: scopeIds.map((id) => ({
      id: `event-${id}`,
      action: 'events.update',
      resource: 'activity',
      effect: 'allow' as const,
      scope: { type: 'organization', id },
    })),
  };
}

describe('events security regressions', () => {
  it('lets a sports domain manager update an activity', async () => {
    const store = createMemoryStore();
    const actor: AuthorizationContext = {
      uid: 'sports-lead',
      displayName: 'Sports lead',
      avatarUrl: null,
      baseRole: 'student',
      roles: ['domain.sports_lead'],
      tags: [],
    };
    await store.subjects.create({
      uid: actor.uid,
      displayName: actor.displayName,
      avatarUrl: actor.avatarUrl,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: { type: 'public', id: '*' },
    });
    await store.roleAssignments.create({
      subjectUid: actor.uid,
      roleKey: 'domain.sports_lead',
      expiresAt: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: { type: 'public', id: '*' },
    });
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => actor },
    });
    await request(app)
      .patch('/api/development/v1/events/activities')
      .set('X-Demo-User', actor.uid)
      .send({ id: 'activity-night-run', description: 'Domain-maintained activity.' })
      .expect(200);
  });

  it('uses the transaction-time activity scope for update authorization', async () => {
    const base = createMemoryStore();
    const activity = await base.activities.create({
      title: 'Scoped activity',
      description: 'Original',
      clubId: null,
      startsAt: null,
      status: 'draft',
      ownerUid: 'owner',
      scope: { type: 'organization', id: 'org-a' },
    });
    let raced = false;
    const store: DevelopmentStore = {
      ...base,
      transaction: async (operation) => {
        if (!raced) {
          raced = true;
          await base.activities.update(activity.id, {
            scope: { type: 'organization', id: 'org-c' },
          });
        }
        return base.transaction(operation);
      },
    };
    const actor = scopedActor(['org-a', 'org-b']);
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => actor },
    });

    await request(app)
      .patch('/api/development/v1/events/activities')
      .set('X-Demo-User', actor.uid)
      .send({ id: activity.id, scope: { type: 'organization', id: 'org-b' } })
      .expect(404);
    expect(await base.activities.get(activity.id)).toMatchObject({
      scope: { type: 'organization', id: 'org-c' },
    });
  });

  it('allows a personal cancellation after the activity closes and rejects spoofed creation fields', async () => {
    const store = createMemoryStore();
    const actor: AuthorizationContext = {
      uid: 'demo-student',
      displayName: 'Student',
      avatarUrl: null,
      baseRole: 'student',
      roles: [],
      tags: [],
    };
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => actor },
    });
    await store.activities.update('activity-orientation', { status: 'closed' });
    await request(app)
      .delete('/api/development/v1/events/activities/activity-orientation/registrations')
      .set('X-Demo-User', actor.uid)
      .expect(204);

    await request(app)
      .post('/api/development/v1/events/activities')
      .set('X-Demo-User', actor.uid)
      .send({
        title: 'Spoofed activity',
        description: 'Client identity must be rejected.',
        ownerUid: actor.uid,
        scope: { type: 'public', id: '*' },
      })
      .expect(400);
  });
});
