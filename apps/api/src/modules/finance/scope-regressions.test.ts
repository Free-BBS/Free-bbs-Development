import type { ScopeRef } from '@freebbs-development/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

function scopedActor(uid: string): AuthorizationContext {
  return {
    uid,
    displayName: 'Scoped finance user',
    avatarUrl: null,
    baseRole: 'student',
    roles: [],
    tags: [],
  };
}

async function assignScopedFinanceDirector(
  store: DevelopmentStore,
  actor: AuthorizationContext,
  scope: ScopeRef,
): Promise<void> {
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
    roleKey: 'department.rights_development_director',
    expiresAt: null,
    status: 'active',
    ownerUid: 'demo-admin',
    scope,
  });
}

describe('finance scoped authorization regressions', () => {
  it('returns an authorized empty scoped result instead of confusing it with forbidden', async () => {
    const store = createMemoryStore();
    const actor = scopedActor('scoped-empty-reader');
    const emptyScope = { type: 'organization', id: 'empty-org' } as const;
    await assignScopedFinanceDirector(store, actor, emptyScope);
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => actor },
    });

    const scoped = await request(app)
      .get('/api/development/v1/finance/records?scopeType=organization&scopeId=empty-org')
      .set('X-Demo-User', actor.uid)
      .expect(200);
    expect(scoped.body.data).toEqual([]);

    const unscoped = await request(app)
      .get('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .expect(200);
    expect(unscoped.body.data).toEqual([]);
  });

  it('filters and mutates by each record exact scope without revealing denied identifiers', async () => {
    const store = createMemoryStore();
    const allowedScope = { type: 'organization', id: 'allowed-org' } as const;
    const deniedScope = { type: 'organization', id: 'denied-org' } as const;
    const actor = scopedActor('scoped-finance-manager');
    await assignScopedFinanceDirector(store, actor, allowedScope);
    const allowed = await store.financeRecords.create({
      title: 'Allowed budget',
      kind: 'budget',
      amountCents: 100,
      activityId: null,
      status: 'draft',
      ownerUid: 'another-user',
      scope: allowedScope,
    });
    const denied = await store.financeRecords.create({
      title: 'Denied budget',
      kind: 'budget',
      amountCents: 200,
      activityId: null,
      status: 'draft',
      ownerUid: 'another-user',
      scope: deniedScope,
    });
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => actor },
    });

    const listed = await request(app)
      .get('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .expect(200);
    expect(listed.body.data.map((record: { id: string }) => record.id)).toContain(allowed.id);
    expect(listed.body.data.map((record: { id: string }) => record.id)).not.toContain(denied.id);

    await request(app)
      .patch('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({ id: allowed.id, title: 'Updated allowed budget' })
      .expect(200);
    const deniedKnown = await request(app)
      .patch('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({ id: denied.id, title: 'Forbidden update' })
      .expect(404);
    const deniedUnknown = await request(app)
      .patch('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({ id: 'missing-record', title: 'Unknown update' })
      .expect(404);
    expect(deniedKnown.body.data.error.code).toBe(deniedUnknown.body.data.error.code);

    await request(app)
      .post(`/api/development/v1/finance/records/${allowed.id}/transitions`)
      .set('X-Demo-User', actor.uid)
      .send({ to: 'submitted' })
      .expect(200);
    const transitionKnown = await request(app)
      .post(`/api/development/v1/finance/records/${denied.id}/transitions`)
      .set('X-Demo-User', actor.uid)
      .send({ to: 'submitted' })
      .expect(404);
    const transitionUnknown = await request(app)
      .post('/api/development/v1/finance/records/missing-record/transitions')
      .set('X-Demo-User', actor.uid)
      .send({ to: 'submitted' })
      .expect(404);
    expect(transitionKnown.body.data.error.code).toBe(transitionUnknown.body.data.error.code);
  });
});
