import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { createMemoryStore } from '../../core/database/memory-store.js';
import type { DevelopmentStore } from '../../core/database/types.js';

function actor(scopes: string[]): AuthorizationContext {
  return {
    uid: 'scoped-maintainer',
    displayName: 'Scoped maintainer',
    avatarUrl: null,
    baseRole: 'student',
    roles: [],
    tags: [],
    policies: scopes.map((id) => ({
      id: `liaison-${id}`,
      action: 'liaison.resource.update',
      resource: 'liaison_resource',
      effect: 'allow' as const,
      scope: { type: 'organization', id },
    })),
  };
}

describe('liaison review regressions', () => {
  it('fails closed when its module row is missing', async () => {
    const app = createApp({ store: createMemoryStore({ seed: false }) });
    await request(app).get('/api/development/v1/liaison/resources').expect(503);
  });

  it('rechecks the transaction-time scope before moving a resource', async () => {
    const base = createMemoryStore();
    const resource = await base.liaisonResources.create({
      name: 'Scoped',
      description: 'Scoped body',
      category: 'contact',
      visibility: 'restricted',
      status: 'active',
      ownerUid: 'owner',
      scope: { type: 'organization', id: 'org-a' },
    });
    let raced = false;
    const store: DevelopmentStore = {
      ...base,
      transaction: async (operation) => {
        if (!raced) {
          raced = true;
          await base.liaisonResources.update(resource.id, {
            scope: { type: 'organization', id: 'org-c' },
          });
        }
        return base.transaction(operation);
      },
    };
    const scopedActor = actor(['org-a', 'org-b']);
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => scopedActor },
    });
    await request(app)
      .patch('/api/development/v1/liaison/resources')
      .set('X-Demo-User', scopedActor.uid)
      .send({ id: resource.id, scope: { type: 'organization', id: 'org-b' } })
      .expect(404);
    expect(await base.liaisonResources.get(resource.id)).toMatchObject({
      scope: { type: 'organization', id: 'org-c' },
    });
  });

  it('audits restricted create and content updates without sensitive values', async () => {
    const store = createMemoryStore();
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-admin']),
    });
    const created = await request(app)
      .post('/api/development/v1/liaison/resources')
      .set('X-Demo-User', 'demo-admin')
      .send({
        name: 'Sensitive contact',
        description: 'secret@example.test',
        category: 'contact',
        visibility: 'restricted',
        scope: { type: 'organization', id: 'org-a' },
      })
      .expect(201);
    await request(app)
      .patch('/api/development/v1/liaison/resources')
      .set('X-Demo-User', 'demo-admin')
      .send({ id: created.body.data.id, description: 'new-secret@example.test' })
      .expect(200);
    const audits = await store.auditLogs.list({ query: created.body.data.id });
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'liaison.resource.create_restricted',
        'liaison.resource.update_restricted',
      ]),
    );
    expect(JSON.stringify(audits)).not.toMatch(/Sensitive contact|secret@example.test|new-secret/i);
  });
});
