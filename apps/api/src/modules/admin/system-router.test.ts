import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

const statusPath = '/api/development/v1/admin/system-status';

describe('admin system status', () => {
  it('reports only non-sensitive release, data and module counts', async () => {
    const store = createMemoryStore();
    const app = createApp({
      store,
      version: '2026.07.27-test',
      databaseMode: 'memory',
      appliedMigrationCount: 4,
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-admin']),
    });

    const response = await request(app)
      .get(statusPath)
      .set('X-Demo-User', 'demo-admin')
      .expect(200);
    expect(response.body.data).toEqual({
      version: '2026.07.27-test',
      dataMode: 'memory',
      appliedMigrationCount: 4,
      moduleCounts: { total: 9, enabled: 9, disabled: 0 },
    });

    const serialized = JSON.stringify(response.body.data).toLocaleLowerCase();
    for (const sensitive of [
      'host',
      'hostname',
      'password',
      'token',
      'secret',
      'connection',
      'mysql_user',
      'mysql_password',
      'database_url',
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it('uses existing admin authorization and reflects current module state', async () => {
    const store = createMemoryStore();
    const app = createApp({
      store,
      version: 'test-version',
      databaseMode: 'memory',
      appliedMigrationCount: 0,
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-admin', 'demo-student']),
    });

    await request(app).get(statusPath).set('X-Demo-User', 'demo-student').expect(403);
    const sports = (await store.modules.list({ query: 'sports' })).find(
      ({ moduleId }) => moduleId === 'sports',
    );
    if (sports === undefined) throw new Error('sports module fixture is missing');
    await store.modules.update(sports.id, { enabled: false, status: 'disabled' });

    const response = await request(app)
      .get(statusPath)
      .set('X-Demo-User', 'demo-admin')
      .expect(200);
    expect(response.body.data.moduleCounts).toEqual({ total: 9, enabled: 8, disabled: 1 });
  });
});
