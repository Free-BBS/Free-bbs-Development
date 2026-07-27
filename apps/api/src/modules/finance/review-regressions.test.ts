import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

describe('finance security regressions', () => {
  it('does not let an update-only finance director approve a record', async () => {
    const store = createMemoryStore();
    const actor: AuthorizationContext = {
      uid: 'finance-director',
      displayName: 'Finance director',
      avatarUrl: null,
      baseRole: 'student',
      roles: ['department.rights_development_director'],
      tags: [],
    };
    const record = await store.financeRecords.create({
      title: 'Submitted budget',
      kind: 'budget',
      amountCents: 1000,
      activityId: null,
      status: 'submitted',
      ownerUid: actor.uid,
      scope: { type: 'public', id: '*' },
    });
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => actor },
    });

    const known = await request(app)
      .patch('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({ id: record.id, status: 'approved' })
      .expect(404);
    const unknown = await request(app)
      .patch('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({ id: 'missing-record', status: 'approved' })
      .expect(404);
    expect(known.body.data.error.code).toBe(unknown.body.data.error.code);
    expect(await store.financeRecords.get(record.id)).toMatchObject({ status: 'submitted' });
  });

  it('rejects numeric strings and omits titles and amounts from transactional audit details', async () => {
    const store = createMemoryStore();
    const actor: AuthorizationContext = {
      uid: 'finance-lead',
      displayName: 'Finance lead',
      avatarUrl: null,
      baseRole: 'student',
      roles: ['domain.rights_development_lead'],
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
      roleKey: 'domain.rights_development_lead',
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
      .post('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({
        title: 'String amount',
        kind: 'budget',
        amountCents: '100',
        scope: { type: 'public', id: '*' },
      })
      .expect(400);

    const created = await request(app)
      .post('/api/development/v1/finance/records')
      .set('X-Demo-User', actor.uid)
      .send({
        title: 'Sensitive vendor alpha',
        kind: 'settlement',
        amountCents: 712345,
        status: 'submitted',
        scope: { type: 'public', id: '*' },
      })
      .expect(201);
    const audits = await store.auditLogs.list({ query: created.body.data.id });
    expect(JSON.stringify(audits)).not.toMatch(/Sensitive vendor alpha|712345/);
  });
});
