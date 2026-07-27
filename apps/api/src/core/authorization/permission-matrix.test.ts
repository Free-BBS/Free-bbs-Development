import { describe, expect, it } from 'vitest';

import { authorize } from './authorize.js';

import type { AuthorizationContext, AuthorizationPolicy } from './policy.js';

const baseUser = (policies: AuthorizationPolicy[] = []): AuthorizationContext => ({
  uid: 'user-1',
  displayName: 'Test student',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
  policies,
});

describe('compiled authorization policy matrix', () => {
  it('does not grant through coarse roles or tags', () => {
    const untrusted: AuthorizationContext = {
      ...baseUser(),
      roles: ['platform.super_admin'],
      tags: [
        {
          key: 'sports.team_captain',
          scope: { type: 'sports_team', id: 'team-a' },
        },
      ],
    };

    expect(authorize(untrusted, { action: 'admin.manage', resource: 'admin' }).allowed).toBe(false);
    expect(
      authorize(untrusted, {
        action: 'sports.checkin.create',
        resource: 'sports_checkin',
        scope: { type: 'sports_team', id: 'team-a' },
      }).allowed,
    ).toBe(false);
  });

  it('makes a current explicit deny override an allow through the same policy path', () => {
    const context = baseUser([
      {
        id: 'global-allow',
        action: 'sports.checkin.create',
        resource: 'sports_checkin',
        effect: 'allow',
      },
      {
        id: 'team-deny',
        action: 'sports.checkin.create',
        resource: 'sports_checkin',
        effect: 'deny',
        scope: { type: 'sports_team', id: 'team-a' },
      },
    ]);

    expect(
      authorize(context, {
        action: 'sports.checkin.create',
        resource: 'sports_checkin',
        scope: { type: 'sports_team', id: 'team-a' },
      }),
    ).toEqual({
      allowed: false,
      reason: 'explicit-deny',
      matchedBy: 'policy:team-deny',
    });
  });

  it('chooses the most-specific current allow and reports scope mismatches', () => {
    const scoped: AuthorizationPolicy = {
      id: 'team-a',
      action: 'sports.checkin.read',
      resource: 'sports_checkin',
      effect: 'allow',
      scope: { type: 'sports_team', id: 'team-a' },
    };
    const context = baseUser([
      {
        id: 'global',
        action: 'sports.checkin.read',
        resource: 'sports_checkin',
        effect: 'allow',
      },
      scoped,
    ]);

    expect(
      authorize(context, {
        action: 'sports.checkin.read',
        resource: 'sports_checkin',
        scope: { type: 'sports_team', id: 'team-a' },
      }),
    ).toEqual({
      allowed: true,
      reason: 'policy-grant',
      matchedBy: 'policy:team-a',
    });
    expect(
      authorize(baseUser([scoped]), {
        action: 'sports.checkin.read',
        resource: 'sports_checkin',
        scope: { type: 'sports_team', id: 'team-b' },
      }),
    ).toEqual({
      allowed: false,
      reason: 'scope-mismatch',
      matchedBy: 'policy:team-a',
    });
  });

  it('ignores expired grants and denies unknown permissions', () => {
    const expired = baseUser([
      {
        id: 'expired',
        action: 'events.create',
        resource: 'activity',
        effect: 'allow',
        expiresAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(
      authorize(
        expired,
        { action: 'events.create', resource: 'activity' },
        new Date('2026-07-27T00:00:00.000Z'),
      ),
    ).toEqual({
      allowed: false,
      reason: 'expired-assignment',
      matchedBy: 'policy:expired',
    });
    expect(authorize(baseUser(), { action: 'unknown.execute', resource: 'unknown' })).toEqual({
      allowed: false,
      reason: 'unknown-permission',
      matchedBy: null,
    });
  });
});
