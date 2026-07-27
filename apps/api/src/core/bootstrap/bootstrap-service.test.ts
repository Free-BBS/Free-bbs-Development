import { MODULE_IDS, ROLE_KEYS } from '@freebbs-development/contracts';
import { describe, expect, it } from 'vitest';

import {
  BASE_STUDENT_PERMISSIONS,
  ROLE_PERMISSION_CATALOG,
  SPORTS_CAPTAIN_RULES,
} from '../authorization/permission-catalog.js';
import { createMemoryStore } from '../database/memory-store.js';
import type { AuditLogRecord, DevelopmentStore, RecordRepository } from '../database/types.js';
import {
  BUILT_IN_MODULES,
  BUILT_IN_PERMISSIONS,
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_PERMISSIONS,
  BUILT_IN_TAG_DEFINITIONS,
  BUILT_IN_TAG_PERMISSIONS,
} from './built-in-definitions.js';
import { bootstrapPlatform } from './bootstrap-service.js';

const now = new Date('2026-07-27T08:30:00.000Z');
const publicScope = { type: 'public', id: '*' };

function bootstrapInput(uid: string, recovery = false) {
  return { uid, recovery, version: '834a804', now };
}

function permissionKey(value: { action: string; resource: string }): string {
  return `${value.action}\u0000${value.resource}`;
}

function failingAuditStore(store: DevelopmentStore): DevelopmentStore {
  return {
    ...store,
    transaction: (operation) =>
      store.transaction((transactionStore) => {
        const auditLogs: RecordRepository<AuditLogRecord> = {
          create: async () => {
            throw new Error('simulated audit failure');
          },
          get: transactionStore.auditLogs.get.bind(transactionStore.auditLogs),
          getForUpdate: transactionStore.auditLogs.getForUpdate.bind(transactionStore.auditLogs),
          list: transactionStore.auditLogs.list.bind(transactionStore.auditLogs),
          page: transactionStore.auditLogs.page.bind(transactionStore.auditLogs),
          update: transactionStore.auditLogs.update.bind(transactionStore.auditLogs),
          delete: transactionStore.auditLogs.delete.bind(transactionStore.auditLogs),
        };
        return operation({ ...transactionStore, auditLogs });
      }),
  };
}

describe('production governance bootstrap', () => {
  it('defines the exact built-in governance catalog', () => {
    expect(BUILT_IN_ROLES.map(({ key }) => key)).toEqual(ROLE_KEYS);
    expect(BUILT_IN_MODULES.map(({ moduleId }) => moduleId)).toEqual(MODULE_IDS);
    expect(BUILT_IN_TAG_DEFINITIONS).toEqual([
      expect.objectContaining({
        key: 'sports.team_captain',
        requiredScopeType: 'sports_team',
      }),
    ]);
    expect(BUILT_IN_TAG_DEFINITIONS.map(({ key }) => key)).not.toContain('extension.custom');

    const catalogRules = [
      ...BASE_STUDENT_PERMISSIONS,
      ...Object.values(ROLE_PERMISSION_CATALOG).flat(),
      ...SPORTS_CAPTAIN_RULES,
    ];
    expect(BUILT_IN_PERMISSIONS.map(permissionKey).sort()).toEqual(
      [...new Set(catalogRules.map(permissionKey))].sort(),
    );
    expect(BUILT_IN_ROLE_PERMISSIONS).toHaveLength(
      Object.values(ROLE_PERMISSION_CATALOG).flat().length,
    );
    expect(BUILT_IN_TAG_PERMISSIONS).toEqual(
      SPORTS_CAPTAIN_RULES.map((rule) =>
        expect.objectContaining({
          tagKey: 'sports.team_captain',
          action: rule.action,
          resource: rule.resource,
          effect: 'allow',
          scope: { type: 'sports_team', id: '*' },
        }),
      ),
    );
  });

  it('atomically bootstraps all definitions and the first super administrator', async () => {
    const store = createMemoryStore({ seed: false });

    const result = await bootstrapPlatform(store, bootstrapInput('u_20260727_admin'));

    expect(result).toMatchObject({
      uid: 'u_20260727_admin',
      recovered: false,
      subjectId: expect.any(String),
      roleAssignmentId: expect.any(String),
    });
    expect((await store.roles.list()).map((role) => role.key)).toEqual(
      expect.arrayContaining([...ROLE_KEYS]),
    );
    expect(await store.roles.list()).toHaveLength(ROLE_KEYS.length);
    expect((await store.permissions.list()).map(permissionKey).sort()).toEqual(
      BUILT_IN_PERMISSIONS.map(permissionKey).sort(),
    );
    expect(await store.rolePermissions.list()).toHaveLength(BUILT_IN_ROLE_PERMISSIONS.length);
    expect(await store.tagPermissions.list()).toHaveLength(BUILT_IN_TAG_PERMISSIONS.length);
    const moduleIds = (await store.modules.list()).map((item) => item.moduleId);
    expect(moduleIds).toHaveLength(MODULE_IDS.length);
    expect(
      moduleIds.sort((left, right) => MODULE_IDS.indexOf(left) - MODULE_IDS.indexOf(right)),
    ).toEqual(MODULE_IDS);

    expect(await store.subjects.list({ query: 'u_20260727_admin' })).toEqual([
      expect.objectContaining({
        id: result.subjectId,
        uid: 'u_20260727_admin',
        displayName: 'u_20260727_admin',
        avatarUrl: null,
        status: 'active',
        ownerUid: 'u_20260727_admin',
        scope: publicScope,
      }),
    ]);
    expect(await store.roleAssignments.list({ query: 'u_20260727_admin' })).toEqual([
      expect.objectContaining({
        id: result.roleAssignmentId,
        subjectUid: 'u_20260727_admin',
        roleKey: 'platform.super_admin',
        expiresAt: null,
        status: 'active',
        ownerUid: 'u_20260727_admin',
        scope: publicScope,
      }),
    ]);
    expect(await store.auditLogs.list({ query: 'u_20260727_admin' })).toEqual([
      expect.objectContaining({
        actorUid: 'u_20260727_admin',
        action: 'platform.bootstrap',
        resourceType: 'platform',
        resourceId: 'u_20260727_admin',
        details: {
          version: '834a804',
          occurredAt: now.toISOString(),
          recovered: false,
        },
      }),
    ]);
  });

  it('refuses normal bootstrap when any active super administrator exists without mutation', async () => {
    const store = createMemoryStore({ seed: false });
    await bootstrapPlatform(store, bootstrapInput('u_first'));
    const countsBefore = await Promise.all([
      store.subjects.list(),
      store.roles.list(),
      store.roleAssignments.list(),
      store.auditLogs.list(),
    ]);

    await expect(bootstrapPlatform(store, bootstrapInput('u_second'))).rejects.toMatchObject({
      code: 'super_admin_already_exists',
    });

    const countsAfter = await Promise.all([
      store.subjects.list(),
      store.roles.list(),
      store.roleAssignments.list(),
      store.auditLogs.list(),
    ]);
    expect(countsAfter).toEqual(countsBefore);
  });

  it('separately audits recovery but refuses a duplicate target assignment', async () => {
    const store = createMemoryStore({ seed: false });
    await bootstrapPlatform(store, bootstrapInput('u_first'));

    const recovered = await bootstrapPlatform(store, bootstrapInput('u_recovered', true));

    expect(recovered).toMatchObject({ uid: 'u_recovered', recovered: true });
    expect(await store.roles.list()).toHaveLength(ROLE_KEYS.length);
    expect(await store.modules.list()).toHaveLength(MODULE_IDS.length);
    expect((await store.auditLogs.list()).map(({ action }) => action)).toContain(
      'platform.bootstrap.recovery',
    );
    const assignmentsBefore = await store.roleAssignments.list();
    await expect(
      bootstrapPlatform(store, bootstrapInput('u_recovered', true)),
    ).rejects.toMatchObject({ code: 'super_admin_assignment_exists' });
    expect(await store.roleAssignments.list()).toEqual(assignmentsBefore);
  });

  it('rolls back every definition when the final audit write fails', async () => {
    const rootStore = createMemoryStore({ seed: false });

    await expect(
      bootstrapPlatform(failingAuditStore(rootStore), bootstrapInput('u_atomic')),
    ).rejects.toThrow('simulated audit failure');

    expect(await rootStore.subjects.list()).toEqual([]);
    expect(await rootStore.roles.list()).toEqual([]);
    expect(await rootStore.permissions.list()).toEqual([]);
    expect(await rootStore.rolePermissions.list()).toEqual([]);
    expect(await rootStore.roleAssignments.list()).toEqual([]);
    expect(await rootStore.tagDefinitions.list()).toEqual([]);
    expect(await rootStore.tagPermissions.list()).toEqual([]);
    expect(await rootStore.modules.list()).toEqual([]);
    expect(await rootStore.auditLogs.list()).toEqual([]);
  });
});
