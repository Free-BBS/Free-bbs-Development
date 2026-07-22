import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

const student = { 'X-Demo-User': 'demo-student' };
const admin = { 'X-Demo-User': 'demo-admin' };

function fixture() {
  const store = createMemoryStore();
  const app = createApp({
    store,
    authMode: 'demo',
    authClient: new DemoAuthClient(['demo-student', 'demo-admin']),
  });
  return { app, store };
}

describe('finance API', () => {
  it('requires explicit finance permission for reads and writes', async () => {
    const { app } = fixture();
    await request(app).get('/api/development/v1/finance/records').set(student).expect(403);
    await request(app)
      .post('/api/development/v1/finance/records')
      .set(student)
      .send({
        title: 'Unauthorized budget',
        kind: 'budget',
        amountCents: 100,
        status: 'draft',
        scope: { type: 'public', id: '*' },
      })
      .expect(403);
  });

  it('stores integer cents with authenticated ownership and audits without the amount value', async () => {
    const { app, store } = fixture();
    const created = await request(app)
      .post('/api/development/v1/finance/records')
      .set(admin)
      .send({
        title: 'Orientation budget',
        kind: 'budget',
        amountCents: 0,
        activityId: 'activity-orientation',
        status: 'submitted',
        scope: { type: 'activity', id: 'activity-orientation' },
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      amountCents: 0,
      ownerUid: 'demo-admin',
      activityId: 'activity-orientation',
    });

    await request(app)
      .patch('/api/development/v1/finance/records')
      .set(admin)
      .send({ id: created.body.data.id, amountCents: 2500, status: 'approved' })
      .expect(200);
    const audit = await store.auditLogs.list({ query: created.body.data.id });
    expect(audit.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(audit)).not.toContain('2500');
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amountCents %s',
    async (amountCents) => {
      const { app } = fixture();
      await request(app)
        .post('/api/development/v1/finance/records')
        .set(admin)
        .send({
          title: 'Invalid amount',
          kind: 'budget',
          amountCents,
          status: 'draft',
          scope: { type: 'public', id: '*' },
        })
        .expect(400);
    },
  );

  it('strictly rejects client-owned fields and fails closed without a module row', async () => {
    const { app } = fixture();
    await request(app)
      .post('/api/development/v1/finance/records')
      .set(admin)
      .send({
        title: 'Spoofed owner',
        kind: 'settlement',
        amountCents: 100,
        ownerUid: 'spoofed',
        status: 'draft',
        scope: { type: 'public', id: '*' },
      })
      .expect(400);

    const empty = createMemoryStore({ seed: false });
    const closed = createApp({
      store: empty,
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-admin']),
    });
    await request(closed).get('/api/development/v1/finance/records').set(admin).expect(503);
  });
});
