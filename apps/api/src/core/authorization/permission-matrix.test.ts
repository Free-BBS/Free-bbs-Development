import { describe, expect, it } from 'vitest';

import { authorize } from './authorize.js';

import type { UserContext } from '@freebbs-development/contracts';
import type { AuthorizationContext, AuthorizationRequest } from './policy.js';

const baseUser = (overrides: Partial<UserContext> = {}): AuthorizationContext => ({
  uid: 'user-1',
  displayName: '测试同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
  ...overrides,
});

const request = (
  action: string,
  resource: string,
  scope?: { type: string; id: string },
): AuthorizationRequest => ({ action, resource, scope });

describe('role permission matrix', () => {
  it.each([
    ['domain.arts_lead', 'clubs.manage', 'club'],
    ['domain.sports_lead', 'sports.team.manage', 'sports_team'],
    ['domain.liaison_lead', 'liaison.resource.manage', 'liaison_resource'],
    ['domain.rights_development_lead', 'finance.record.manage', 'finance_record'],
  ] as const)('grants each domain lead its domain management action', (role, action, resource) => {
    expect(authorize(baseUser({ roles: [role] }), request(action, resource))).toMatchObject({
      allowed: true,
      reason: 'role-grant',
      matchedBy: `role:${role}`,
    });
  });

  it.each([
    ['department.arts_director', 'events.update', 'activity'],
    ['department.sports_director', 'sports.checkin.create', 'sports_checkin'],
    ['department.liaison_director', 'information.announcement.publish', 'announcement'],
    ['department.rights_development_director', 'finance.record.create', 'finance_record'],
  ] as const)('grants department directors operational actions', (role, action, resource) => {
    expect(authorize(baseUser({ roles: [role] }), request(action, resource)).allowed).toBe(true);
  });

  it.each([
    ['department.arts_member', 'events.create', 'activity'],
    ['department.sports_member', 'sports.checkin.read', 'sports_checkin'],
    ['department.liaison_member', 'liaison.resource.create', 'liaison_resource'],
    ['department.rights_development_member', 'information.consultation.triage', 'consultation'],
  ] as const)('grants department members bounded contributor actions', (role, action, resource) => {
    expect(authorize(baseUser({ roles: [role] }), request(action, resource)).allowed).toBe(true);
  });

  it('grants Tuanwei and SAST their distinct integration actions', () => {
    expect(
      authorize(
        baseUser({ roles: ['affiliation.tuanwei_member'] }),
        request('events.approve', 'activity'),
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        baseUser({ roles: ['affiliation.sast_member'] }),
        request('events.technical_support', 'activity'),
      ).allowed,
    ).toBe(true);
  });

  it('treats an authenticated ordinary student as the default non-elevated role', () => {
    expect(
      authorize(baseUser(), request('information.consultation.create', 'consultation')).allowed,
    ).toBe(true);
    expect(authorize(baseUser(), request('admin.role.assign', 'role_assignment'))).toEqual({
      allowed: false,
      reason: 'no-matching-grant',
      matchedBy: null,
    });
  });

  it('unions multiple roles without requiring every role to grant the action', () => {
    const user = baseUser({ roles: ['department.arts_member', 'department.sports_director'] });
    expect(authorize(user, request('sports.checkin.create', 'sports_checkin')).allowed).toBe(true);
    expect(authorize(user, request('events.create', 'activity')).allowed).toBe(true);
  });

  it('lets the super administrator perform any action on any resource', () => {
    expect(
      authorize(
        baseUser({ roles: ['platform.super_admin'] }),
        request('future.module.configure', 'future_resource', { type: 'future', id: '42' }),
      ),
    ).toMatchObject({
      allowed: true,
      reason: 'role-grant',
      matchedBy: 'role:platform.super_admin',
    });
  });
});

describe('authorization precedence and scopes', () => {
  it('makes an explicit deny override a role allow', () => {
    const user: AuthorizationContext = {
      ...baseUser({ roles: ['domain.sports_lead'] }),
      policies: [
        {
          id: 'suspension-1',
          action: 'sports.team.manage',
          resource: 'sports_team',
          effect: 'deny',
        },
      ],
    };

    expect(authorize(user, request('sports.team.manage', 'sports_team'))).toEqual({
      allowed: false,
      reason: 'explicit-deny',
      matchedBy: 'policy:suspension-1',
    });
  });

  it('makes an expired matching assignment override another allow', () => {
    const user: AuthorizationContext = {
      ...baseUser({ roles: ['department.arts_member'] }),
      policies: [
        {
          id: 'expired-delegation',
          action: 'events.create',
          resource: 'activity',
          effect: 'allow',
          expiresAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    expect(
      authorize(user, request('events.create', 'activity'), new Date('2026-07-22T00:00:00.000Z')),
    ).toEqual({
      allowed: false,
      reason: 'expired-assignment',
      matchedBy: 'policy:expired-delegation',
    });
  });

  it('does not apply a scoped policy outside its scope', () => {
    const user: AuthorizationContext = {
      ...baseUser(),
      policies: [
        {
          id: 'team-a-only',
          action: 'sports.checkin.create',
          resource: 'sports_checkin',
          effect: 'allow',
          scope: { type: 'sports_team', id: 'team-a' },
        },
      ],
    };

    expect(
      authorize(
        user,
        request('sports.checkin.create', 'sports_checkin', { type: 'sports_team', id: 'team-b' }),
      ),
    ).toEqual({ allowed: false, reason: 'scope-mismatch', matchedBy: 'policy:team-a-only' });
  });

  it('limits a team captain tag to the matching sports team', () => {
    const captain = baseUser({
      tags: [
        {
          key: 'sports.team_captain',
          scope: { type: 'sports_team', id: 'team-a' },
          expiresAt: null,
        },
      ],
    });

    expect(
      authorize(
        captain,
        request('sports.checkin.create', 'sports_checkin', { type: 'sports_team', id: 'team-a' }),
      ),
    ).toEqual({
      allowed: true,
      reason: 'tag-grant',
      matchedBy: 'tag:sports.team_captain:sports_team:team-a',
    });
    expect(
      authorize(
        captain,
        request('sports.checkin.create', 'sports_checkin', { type: 'sports_team', id: 'team-b' }),
      ).allowed,
    ).toBe(false);
    expect(
      authorize(
        captain,
        request('sports.team.manage', 'sports_team', { type: 'sports_team', id: 'team-a' }),
      ).allowed,
    ).toBe(false);
  });

  it('denies an expired captain tag even on its bound team', () => {
    const captain = baseUser({
      tags: [
        {
          key: 'sports.team_captain',
          scope: { type: 'sports_team', id: 'team-a' },
          expiresAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(
      authorize(
        captain,
        request('sports.checkin.read', 'sports_checkin', { type: 'sports_team', id: 'team-a' }),
        new Date('2026-07-22T00:00:00.000Z'),
      ),
    ).toMatchObject({ allowed: false, reason: 'expired-assignment' });
  });
  it('does not treat a captain tag without a sports-team scope as a global grant', () => {
    const invalidCaptain = baseUser({ tags: [{ key: 'sports.team_captain' }] });

    expect(
      authorize(
        invalidCaptain,
        request('sports.checkin.create', 'sports_checkin', {
          type: 'sports_team',
          id: 'team-a',
        }),
      ),
    ).toEqual({ allowed: false, reason: 'no-matching-grant', matchedBy: null });
  });
});
