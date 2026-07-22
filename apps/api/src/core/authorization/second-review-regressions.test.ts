import { describe, expect, it } from 'vitest';

import { createAuthMiddleware } from '../auth/auth-middleware.js';
import { DemoAuthClient } from '../auth/demo-auth-client.js';
import { createMemoryStore } from '../database/memory-store.js';
import { authorize } from './authorize.js';

import type { UserContext } from '@freebbs-development/contracts';

const student: UserContext = {
  uid: 'student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
};

describe('second review: public liaison visibility', () => {
  it('grants the base liaison read only for the explicit public wildcard scope', () => {
    expect(
      authorize(student, {
        action: 'liaison.resource.read',
        resource: 'liaison_resource',
        scope: { type: 'public', id: '*' },
      }).allowed,
    ).toBe(true);

    for (const scope of [
      { type: 'organization', id: 'freebbs' },
      { type: 'restricted', id: 'leadership' },
    ]) {
      expect(
        authorize(student, {
          action: 'liaison.resource.read',
          resource: 'liaison_resource',
          scope,
        }),
      ).toEqual({ allowed: false, reason: 'no-matching-grant', matchedBy: null });
    }

    expect(
      authorize(student, { action: 'liaison.resource.read', resource: 'liaison_resource' }),
    ).toEqual({ allowed: false, reason: 'no-matching-grant', matchedBy: null });
  });
});

describe('second review: deterministic sports lead', () => {
  it('lets the seeded sports lead manage every sports team but not finance', async () => {
    const store = createMemoryStore();
    const authenticate = createAuthMiddleware({
      authClient: new DemoAuthClient(['demo-sports-lead']),
      mode: 'demo',
      store,
    });
    const authenticated = await authenticate({ 'x-demo-user': 'demo-sports-lead' });
    if (authenticated.status !== 200) throw new Error('expected seeded sports lead');

    for (const teamId of ['team-basketball', 'team-badminton']) {
      expect(
        authorize(authenticated.user, {
          action: 'sports.team.manage',
          resource: 'sports_team',
          scope: { type: 'sports_team', id: teamId },
        }).allowed,
      ).toBe(true);
    }
    expect(
      authorize(authenticated.user, {
        action: 'finance.record.read',
        resource: 'finance_record',
        scope: { type: 'public', id: '*' },
      }).allowed,
    ).toBe(false);
  });
});
