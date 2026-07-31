import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

import type { DevelopmentStore } from '../../core/database/types.js';

const adminHeaders = { 'X-Demo-User': 'demo-admin' };
const studentHeaders = { 'X-Demo-User': 'demo-student' };

function liaisonApp(store = createMemoryStore()) {
  return {
    app: createApp({
      store,
      databaseMode: 'memory',
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-admin', 'demo-student']),
    }),
    store,
  };
}

async function addResource(
  store: DevelopmentStore,
  overrides: Partial<Parameters<DevelopmentStore['liaisonResources']['create']>[0]> = {},
) {
  return store.liaisonResources.create({
    name: '测试资源',
    description: '只用于路由边界测试。',
    category: 'contact',
    visibility: 'public',
    status: 'active',
    ownerUid: 'seed-owner',
    scope: { type: 'public', id: '*' },
    ...overrides,
  });
}

describe('liaison API', () => {
  it('lets anonymous callers read only public resources', async () => {
    const { app, store } = liaisonApp();
    await addResource(store, {
      name: '组织联络资源',
      visibility: 'organization',
      scope: { type: 'organization', id: 'freebbs' },
    });
    await addResource(store, {
      name: '绝密联络资源',
      description: 'secret-contact@example.test',
      visibility: 'restricted',
      scope: { type: 'organization', id: 'secret-org' },
    });

    const response = await request(app).get('/api/development/v1/liaison/resources').expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(
      response.body.data.every(
        (resource: { visibility: string; scope: { type: string; id: string } }) =>
          resource.visibility === 'public' &&
          resource.scope.type === 'public' &&
          resource.scope.id === '*',
      ),
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('secret-contact@example.test');
  });

  it('denies an ordinary student restricted access without leaking sensitive values', async () => {
    const { app, store } = liaisonApp();
    await addResource(store, {
      name: '受限联系人',
      description: 'restricted-person@example.test',
      visibility: 'restricted',
      scope: { type: 'organization', id: 'secret-org' },
    });

    const response = await request(app)
      .get(
        '/api/development/v1/liaison/resources?visibility=restricted&scopeType=organization&scopeId=secret-org',
      )
      .set(studentHeaders)
      .expect(403);

    expect(response.body).toMatchObject({
      data: { error: { code: 'forbidden' } },
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toMatch(/受限联系人|restricted-person/i);
    const deniedAudits = (await store.auditLogs.list()).filter(
      (entry) => entry.action === 'liaison.resource.read_denied',
    );
    expect(deniedAudits).toHaveLength(1);
    expect(JSON.stringify(deniedAudits)).not.toMatch(/受限联系人|restricted-person/i);
  });

  it('applies restricted scope filters before returning data and audits each successful read', async () => {
    const { app, store } = liaisonApp();
    const allowed = await addResource(store, {
      name: '组织 A 受限资源',
      visibility: 'restricted',
      scope: { type: 'organization', id: 'org-a' },
    });
    await addResource(store, {
      name: '组织 B 受限资源',
      visibility: 'restricted',
      scope: { type: 'organization', id: 'org-b' },
    });

    const response = await request(app)
      .get(
        '/api/development/v1/liaison/resources?visibility=restricted&scopeType=organization&scopeId=org-a',
      )
      .set(adminHeaders)
      .expect(200);

    expect(response.body.data.map((resource: { id: string }) => resource.id)).toEqual([allowed.id]);
    expect(JSON.stringify(response.body)).not.toContain('组织 B 受限资源');
    expect(await store.auditLogs.list({ query: allowed.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUid: 'demo-admin',
          action: 'liaison.resource.read_restricted',
          resourceId: allowed.id,
        }),
      ]),
    );
  });

  it('uses authenticated ownership for writes and audits status changes', async () => {
    const { app, store } = liaisonApp();
    await request(app)
      .post('/api/development/v1/liaison/resources')
      .set(adminHeaders)
      .send({
        name: '伪造归属资源',
        description: '客户端不能指定 ownerUid。',
        category: 'contact',
        visibility: 'restricted',
        scope: { type: 'organization', id: 'org-a' },
        ownerUid: 'spoofed-user',
      })
      .expect(400);

    const created = await request(app)
      .post('/api/development/v1/liaison/resources')
      .set(adminHeaders)
      .send({
        name: '校友联络说明',
        description: '仅供组织内维护者使用。',
        category: 'alumni',
        visibility: 'restricted',
        scope: { type: 'organization', id: 'org-a' },
      })
      .expect(201);
    expect(created.body.data).toMatchObject({ ownerUid: 'demo-admin', status: 'active' });

    await request(app)
      .post(`/api/development/v1/liaison/resources/${created.body.data.id}/transitions`)
      .set(adminHeaders)
      .send({ to: 'archived' })
      .expect(200);
    expect(await store.auditLogs.list({ query: created.body.data.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'liaison.resource.status_changed',
          resourceId: created.body.data.id,
        }),
      ]),
    );
  });

  it('fails closed when the liaison module is disabled', async () => {
    const { app, store } = liaisonApp();
    const moduleRecord = (await store.modules.list({ query: 'liaison' })).find(
      (record) => record.moduleId === 'liaison',
    );
    expect(moduleRecord).toBeDefined();
    await store.modules.update(moduleRecord!.id, { enabled: false, status: 'disabled' });

    await request(app).get('/api/development/v1/liaison/resources').expect(503);
  });
});
