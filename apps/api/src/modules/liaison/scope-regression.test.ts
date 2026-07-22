import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

describe('liaison scope mutation authorization', () => {
  it('requires update permission on both the current and target scopes', async () => {
    const store = createMemoryStore();
    const current = await store.liaisonResources.create({
      name: '组织 A 资源',
      description: '不能由只有组织 B 权限的人搬移。',
      category: 'contact',
      visibility: 'restricted',
      status: 'active',
      ownerUid: 'org-a-owner',
      scope: { type: 'organization', id: 'org-a' },
    });
    const scopedUser: AuthorizationContext = {
      uid: 'scoped-maintainer',
      displayName: '组织 B 维护者',
      avatarUrl: null,
      baseRole: 'student',
      roles: [],
      tags: [],
      policies: [
        {
          id: 'liaison-update-org-b',
          action: 'liaison.resource.update',
          resource: 'liaison_resource',
          effect: 'allow',
          scope: { type: 'organization', id: 'org-b' },
        },
      ],
    };
    const app = createApp({
      store,
      authMode: 'demo',
      authClient: { introspect: async () => scopedUser },
    });

    await request(app)
      .patch('/api/development/v1/liaison/resources')
      .set('X-Demo-User', 'scoped-maintainer')
      .send({ id: current.id, scope: { type: 'organization', id: 'org-b' } })
      .expect(404);
    expect(await store.liaisonResources.get(current.id)).toMatchObject({
      scope: { type: 'organization', id: 'org-a' },
    });
  });
});
