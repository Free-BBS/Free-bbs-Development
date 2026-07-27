import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

const adminHeaders = { 'X-Demo-User': 'demo-admin' };
const publicScope = { type: 'public', id: '*' } as const;

function adminApp() {
  const store = createMemoryStore();
  const app = createApp({
    store,
    databaseMode: 'memory',
    authMode: 'demo',
    authClient: new DemoAuthClient(['demo-admin']),
  });
  return { app, store };
}

function bindingIdentity(binding: {
  action: string;
  resource: string;
  effect: string;
  scope: { type: string; id: string };
}) {
  return {
    action: binding.action,
    resource: binding.resource,
    effect: binding.effect,
    scope: binding.scope,
  };
}

describe('role permission governance', () => {
  it('lists governed role, permission and role-binding records', async () => {
    const { app } = adminApp();

    const [roles, permissions, bindings] = await Promise.all([
      request(app).get('/api/development/v1/admin/roles').set(adminHeaders).expect(200),
      request(app).get('/api/development/v1/admin/permissions').set(adminHeaders).expect(200),
      request(app).get('/api/development/v1/admin/role-permissions').set(adminHeaders).expect(200),
    ]);

    expect(roles.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'platform.super_admin', status: 'active' }),
        expect.objectContaining({ key: 'domain.arts_lead', status: 'active' }),
      ]),
    );
    expect(permissions.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'knowledge.publish',
          resource: 'knowledge_entry',
          status: 'active',
        }),
      ]),
    );
    expect(bindings.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleKey: 'domain.arts_lead',
          action: 'knowledge.*',
          resource: '*',
          effect: 'allow',
          scope: publicScope,
        }),
      ]),
    );
  });

  it('atomically replaces active bindings, restores a desired tuple and audits identities', async () => {
    const { app, store } = adminApp();
    const previousBindings = (
      await store.rolePermissions.list({ query: 'domain.arts_lead' })
    ).filter(({ roleKey }) => roleKey === 'domain.arts_lead');
    const desired = previousBindings.find(
      ({ action, resource }) => action === 'knowledge.*' && resource === '*',
    );
    if (desired === undefined) throw new Error('expected the built-in arts knowledge binding');
    await store.rolePermissions.update(desired.id, { status: 'inactive' });

    const response = await request(app)
      .put('/api/development/v1/admin/roles/domain.arts_lead/permissions')
      .set(adminHeaders)
      .send({
        bindings: [
          {
            action: 'knowledge.*',
            resource: '*',
            effect: 'allow',
            scope: publicScope,
          },
        ],
      })
      .expect(200);

    expect(response.body.data.bindings).toEqual([
      expect.objectContaining({
        id: desired.id,
        roleKey: 'domain.arts_lead',
        action: 'knowledge.*',
        resource: '*',
        effect: 'allow',
        status: 'active',
        scope: publicScope,
      }),
    ]);
    const stored = (await store.rolePermissions.list({ query: 'domain.arts_lead' })).filter(
      ({ roleKey }) => roleKey === 'domain.arts_lead',
    );
    expect(stored.filter(({ status }) => status === 'active')).toEqual([
      expect.objectContaining({ id: desired.id }),
    ]);
    expect(
      stored.filter(({ id }) => id !== desired.id).every(({ status }) => status === 'inactive'),
    ).toBe(true);

    const audit = (await store.auditLogs.list({ query: 'admin.role_permissions.replace' })).at(0);
    expect(audit).toMatchObject({
      actorUid: 'demo-admin',
      action: 'admin.role_permissions.replace',
      resourceType: 'role',
      resourceId: 'domain.arts_lead',
      details: {
        oldBindings: expect.arrayContaining(
          previousBindings.filter(({ id }) => id !== desired.id).map(bindingIdentity),
        ),
        newBindings: [
          {
            action: 'knowledge.*',
            resource: '*',
            effect: 'allow',
            scope: publicScope,
          },
        ],
      },
    });
  });

  it.each([
    {
      label: 'unknown action',
      invalid: {
        action: 'unknown.export',
        resource: 'knowledge_entry',
        effect: 'allow',
        scope: publicScope,
      },
    },
    {
      label: 'mismatched action and resource',
      invalid: {
        action: 'knowledge.publish',
        resource: 'activity',
        effect: 'allow',
        scope: publicScope,
      },
    },
    {
      label: 'invalid public scope semantics',
      invalid: {
        action: 'knowledge.publish',
        resource: 'knowledge_entry',
        effect: 'allow',
        scope: { type: 'public', id: 'not-wildcard' },
      },
    },
  ])('rejects a mixed replace-set with $label without any write or audit', async ({ invalid }) => {
    const { app, store } = adminApp();
    const before = await store.rolePermissions.list({ query: 'domain.arts_lead' });

    const response = await request(app)
      .put('/api/development/v1/admin/roles/domain.arts_lead/permissions')
      .set(adminHeaders)
      .send({
        bindings: [
          {
            action: 'knowledge.publish',
            resource: 'knowledge_entry',
            effect: 'allow',
            scope: publicScope,
          },
          invalid,
        ],
      })
      .expect(400);

    expect(response.body.data.error.code).toMatch(/invalid|permission/);
    expect(await store.rolePermissions.list({ query: 'domain.arts_lead' })).toEqual(before);
    expect(await store.auditLogs.list({ query: 'admin.role_permissions.replace' })).toEqual([]);
  });

  it('rejects an inactive registered permission definition without replacing bindings', async () => {
    const { app, store } = adminApp();
    const definition = (await store.permissions.list({ query: 'knowledge.publish' })).find(
      ({ action, resource }) => action === 'knowledge.publish' && resource === 'knowledge_entry',
    );
    if (definition === undefined) throw new Error('expected knowledge publish definition');
    await store.permissions.update(definition.id, { status: 'inactive' });
    const before = await store.rolePermissions.list({ query: 'domain.arts_lead' });

    const response = await request(app)
      .put('/api/development/v1/admin/roles/domain.arts_lead/permissions')
      .set(adminHeaders)
      .send({
        bindings: [
          {
            action: 'knowledge.publish',
            resource: 'knowledge_entry',
            effect: 'allow',
            scope: publicScope,
          },
        ],
      })
      .expect(409);

    expect(response.body.data.error.code).toBe('permission_definition_inactive');
    expect(await store.rolePermissions.list({ query: 'domain.arts_lead' })).toEqual(before);
    expect(await store.auditLogs.list({ query: 'admin.role_permissions.replace' })).toEqual([]);
  });

  it('does not expose mutation or deletion routes for immutable built-in role keys', async () => {
    const { app, store } = adminApp();
    const before = (await store.roles.list()).find(({ key }) => key === 'domain.arts_lead');

    await request(app)
      .patch('/api/development/v1/admin/roles/domain.arts_lead')
      .set(adminHeaders)
      .send({ key: 'domain.renamed' })
      .expect(404);
    await request(app)
      .delete('/api/development/v1/admin/roles/domain.arts_lead')
      .set(adminHeaders)
      .expect(404);

    expect((await store.roles.list()).find(({ id }) => id === before?.id)).toEqual(before);
  });
});
