import { describe, expect, it } from 'vitest';

import { authorize } from './authorize.js';

import type { RoleKey, UserContext } from '@freebbs-development/contracts';

function user(roles: RoleKey[] = []): UserContext {
  return {
    uid: 'review-user',
    displayName: '评审用户',
    avatarUrl: null,
    baseRole: 'student',
    roles,
    tags: [],
  };
}

describe('review regressions: catalog coverage', () => {
  it('allows an ordinary authenticated student to read liaison resources', () => {
    expect(
      authorize(user(), {
        action: 'liaison.resource.read',
        resource: 'liaison_resource',
        scope: { type: 'public', id: '*' },
      }).allowed,
    ).toBe(true);
  });

  it.each(['read', 'create', 'update', 'approve'] as const)(
    'allows Tuanwei to %s finance records',
    (operation) => {
      expect(
        authorize(user(['affiliation.tuanwei_member']), {
          action: `finance.record.${operation}`,
          resource: 'finance_record',
        }).allowed,
      ).toBe(true);
    },
  );

  it('does not grant finance access to students or unrelated Tuanwei operations', () => {
    expect(
      authorize(user(), { action: 'finance.record.read', resource: 'finance_record' }).allowed,
    ).toBe(false);
    for (const operation of ['delete', 'export']) {
      expect(
        authorize(user(['affiliation.tuanwei_member']), {
          action: `finance.record.${operation}`,
          resource: 'finance_record',
        }).allowed,
      ).toBe(false);
    }
  });
});

describe('review regressions: fail closed', () => {
  it('denies an unknown runtime role without throwing', () => {
    const corruptContext = user(['future.unknown_role' as RoleKey]);
    expect(() =>
      authorize(corruptContext, { action: 'admin.role.assign', resource: 'role_assignment' }),
    ).not.toThrow();
    expect(
      authorize(corruptContext, { action: 'admin.role.assign', resource: 'role_assignment' }),
    ).toEqual({ allowed: false, reason: 'no-matching-grant', matchedBy: null });
  });
});
