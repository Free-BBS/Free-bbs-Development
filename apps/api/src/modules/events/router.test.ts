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

describe('events API', () => {
  it('registers, prevents duplicates, cancels, and permits later registration', async () => {
    const { app, store } = fixture();
    await request(app)
      .post('/api/development/v1/events/activities/activity-night-run/registrations')
      .set(student)
      .send({ participantUid: 'spoofed' })
      .expect(400);

    const registered = await request(app)
      .post('/api/development/v1/events/activities/activity-night-run/registrations')
      .set(student)
      .send({})
      .expect(201);
    expect(registered.body.data).toMatchObject({
      activityId: 'activity-night-run',
      participantUid: 'demo-student',
      ownerUid: 'demo-student',
      status: 'registered',
      scope: { type: 'activity', id: 'activity-night-run' },
    });

    const duplicate = await request(app)
      .post('/api/development/v1/events/activities/activity-night-run/registrations')
      .set(student)
      .send({})
      .expect(409);
    expect(JSON.stringify(duplicate.body)).not.toContain('ER_DUP_ENTRY');

    await request(app)
      .delete('/api/development/v1/events/activities/activity-night-run/registrations')
      .set(student)
      .expect(204);
    expect(
      (await store.activityRegistrations.list({ query: 'activity-night-run' })).filter(
        (record) => record.participantUid === 'demo-student',
      ),
    ).toEqual([]);
    await request(app)
      .post('/api/development/v1/events/activities/activity-night-run/registrations')
      .set(student)
      .send({})
      .expect(201);
  });

  it('rejects registration unless the transaction-locked activity is open', async () => {
    const { app, store } = fixture();
    await store.activities.update('activity-night-run', { status: 'closed' });
    const response = await request(app)
      .post('/api/development/v1/events/activities/activity-night-run/registrations')
      .set(student)
      .send({})
      .expect(409);
    expect(response.body.data.error.code).toBe('activity_not_open');
  });

  it('lets a domain manager update status atomically with an audit', async () => {
    const { app, store } = fixture();
    await request(app)
      .patch('/api/development/v1/events/activities')
      .set(admin)
      .send({ id: 'activity-night-run', status: 'closed' })
      .expect(200);
    expect(await store.auditLogs.list({ query: 'activity-night-run' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'events.activity.status_changed',
          resourceId: 'activity-night-run',
        }),
      ]),
    );
  });

  it('fails closed when the module row is disabled', async () => {
    const { app, store } = fixture();
    const module = (await store.modules.list({ query: 'events' })).find(
      (record) => record.moduleId === 'events',
    )!;
    await store.modules.update(module.id, { enabled: false, status: 'disabled' });
    await request(app).get('/api/development/v1/events/activities').set(student).expect(503);
  });
});
