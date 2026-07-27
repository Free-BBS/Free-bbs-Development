import { ROLE_KEYS } from '@freebbs-development/contracts';
import { recordAuditEvent } from '../audit/audit-service.js';
import type { DevelopmentStore } from '../database/types.js';
import {
  BUILT_IN_MODULES,
  BUILT_IN_PERMISSIONS,
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_PERMISSIONS,
  BUILT_IN_TAG_DEFINITIONS,
  BUILT_IN_TAG_PERMISSIONS,
} from './built-in-definitions.js';

const publicScope = { type: 'public', id: '*' } as const;
const superAdminRoleKey = ROLE_KEYS[0];

export interface BootstrapInput {
  uid: string;
  recovery: boolean;
  version: string;
  now: Date;
}

export interface BootstrapResult {
  uid: string;
  subjectId: string;
  roleAssignmentId: string;
  recovered: boolean;
}

export class BootstrapError extends Error {
  override readonly name = 'BootstrapError';

  constructor(
    readonly code: 'super_admin_already_exists' | 'super_admin_assignment_exists',
    message: string,
  ) {
    super(message);
  }
}

function identity(...parts: string[]): string {
  return parts.join('\u0000');
}

async function ensureBuiltInDefinitions(store: DevelopmentStore, ownerUid: string): Promise<void> {
  const roles = new Set((await store.roles.list()).map(({ key }) => key));
  for (const definition of BUILT_IN_ROLES) {
    if (roles.has(definition.key)) continue;
    await store.roles.create({
      ...definition,
      status: 'active',
      ownerUid,
      scope: publicScope,
    });
    roles.add(definition.key);
  }

  const permissions = new Set(
    (await store.permissions.list()).map(({ action, resource }) => identity(action, resource)),
  );
  for (const definition of BUILT_IN_PERMISSIONS) {
    const key = identity(definition.action, definition.resource);
    if (permissions.has(key)) continue;
    await store.permissions.create({
      ...definition,
      status: 'active',
      ownerUid,
      scope: publicScope,
    });
    permissions.add(key);
  }

  const rolePermissions = new Set(
    (await store.rolePermissions.list()).map(({ roleKey, action, resource, scope }) =>
      identity(roleKey, action, resource, scope.type, scope.id),
    ),
  );
  for (const definition of BUILT_IN_ROLE_PERMISSIONS) {
    const key = identity(
      definition.roleKey,
      definition.action,
      definition.resource,
      definition.scope.type,
      definition.scope.id,
    );
    if (rolePermissions.has(key)) continue;
    await store.rolePermissions.create({
      ...definition,
      status: 'active',
      ownerUid,
    });
    rolePermissions.add(key);
  }

  const tagDefinitions = new Set((await store.tagDefinitions.list()).map(({ key }) => key));
  for (const definition of BUILT_IN_TAG_DEFINITIONS) {
    if (tagDefinitions.has(definition.key)) continue;
    await store.tagDefinitions.create({
      ...definition,
      metadata: { ...definition.metadata },
      status: 'active',
      ownerUid,
      scope: publicScope,
    });
    tagDefinitions.add(definition.key);
  }

  const tagPermissions = new Set(
    (await store.tagPermissions.list()).map(({ tagKey, action, resource, scope }) =>
      identity(tagKey, action, resource, scope.type, scope.id),
    ),
  );
  for (const definition of BUILT_IN_TAG_PERMISSIONS) {
    const key = identity(
      definition.tagKey,
      definition.action,
      definition.resource,
      definition.scope.type,
      definition.scope.id,
    );
    if (tagPermissions.has(key)) continue;
    await store.tagPermissions.create({
      ...definition,
      status: 'active',
      ownerUid,
    });
    tagPermissions.add(key);
  }

  const modules = new Set((await store.modules.list()).map(({ moduleId }) => moduleId));
  for (const definition of BUILT_IN_MODULES) {
    if (modules.has(definition.moduleId)) continue;
    await store.modules.create({
      ...definition,
      status: 'enabled',
      ownerUid,
      scope: publicScope,
    });
    modules.add(definition.moduleId);
  }
}

export async function bootstrapPlatform(
  store: DevelopmentStore,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  return store.transaction(async (transactionStore) => {
    const superAdminAssignments = (await transactionStore.roleAssignments.list()).filter(
      ({ roleKey }) => roleKey === superAdminRoleKey,
    );
    if (!input.recovery && superAdminAssignments.some(({ status }) => status === 'active')) {
      throw new BootstrapError(
        'super_admin_already_exists',
        'An active platform super administrator already exists',
      );
    }
    if (superAdminAssignments.some(({ subjectUid }) => subjectUid === input.uid)) {
      throw new BootstrapError(
        'super_admin_assignment_exists',
        'The target subject already has a platform super administrator assignment',
      );
    }

    await ensureBuiltInDefinitions(transactionStore, input.uid);

    const existingSubject = (await transactionStore.subjects.list({ query: input.uid })).find(
      ({ uid }) => uid === input.uid,
    );
    const subject =
      existingSubject ??
      (await transactionStore.subjects.create({
        uid: input.uid,
        displayName: input.uid,
        avatarUrl: null,
        status: 'active',
        ownerUid: input.uid,
        scope: publicScope,
      }));
    const assignment = await transactionStore.roleAssignments.create({
      subjectUid: input.uid,
      roleKey: superAdminRoleKey,
      expiresAt: null,
      status: 'active',
      ownerUid: input.uid,
      scope: publicScope,
    });
    await recordAuditEvent(transactionStore, {
      actorUid: input.uid,
      action: input.recovery ? 'platform.bootstrap.recovery' : 'platform.bootstrap',
      resourceType: 'platform',
      resourceId: input.uid,
      details: {
        version: input.version,
        occurredAt: input.now.toISOString(),
        recovered: input.recovery,
      },
    });

    return {
      uid: input.uid,
      subjectId: subject.id,
      roleAssignmentId: assignment.id,
      recovered: input.recovery,
    };
  });
}
