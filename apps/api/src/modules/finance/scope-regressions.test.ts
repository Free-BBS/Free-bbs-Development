import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

describe('finance scoped listing regressions', () => {
  it('returns an authorized empty scoped result instead of confusing it with forbidden', async () => {
    const store = createMemoryStore();
    const actor: AuthorizationContext = {
      uid: 'scoped-finance-reader',
      displayName: 'Scoped finance reader',
      avatarUrl: null,
      baseRole: 'student',
      roles: [],
      tags: [],
      policies: [
        {
          id: 'read-empty-org',
          action: 'finance.record.read',
          resource: 'finance_record',
          effect: 'allow',
          scope: { type: 'organization', id: 'empty-org' },
        },
      ],
    };
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
});
