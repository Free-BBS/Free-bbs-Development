import type { RoleKey, ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import type {
  DevelopmentStore,
  RoleAssignmentRecord,
  TagAssignmentRecord,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

const SUPER_ADMIN_ROLE_KEY: RoleKey = 'platform.super_admin';

interface AssignmentInput {
  subjectUid: string;
  expiresAt?: string | null;
  scope?: ScopeRef;
}

export interface RoleAssignmentInput extends AssignmentInput {
  roleKey: RoleKey;
}

export interface TagAssignmentInput extends AssignmentInput {
  tagKey: string;
}

export interface AssignmentMutationContext {
  actorUid: string;
  now?: Date;
}

const publicScope: ScopeRef = { type: 'public', id: '*' };

function exact<T>(values: readonly T[], predicate: (value: T) => boolean): T | undefined {
  return values.find(predicate);
}

function validateScope(scope: ScopeRef): void {
  const isPublic = scope.type === 'public';
  if (isPublic && scope.id !== '*') {
    throw new HttpError(400, 'invalid_scope', 'Assignment scope is not valid');
  }
}

function validateExpiry(expiresAt: string | null | undefined, now: Date): void {
  if (expiresAt === null || expiresAt === undefined) return;
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new HttpError(400, 'invalid_expiry', 'Assignment expiry must be in the future');
  }
}

async function requireActiveSubject(store: DevelopmentStore, subjectUid: string) {
  const subject = exact(
    await store.subjects.list({ query: subjectUid }),
    (candidate) => candidate.uid === subjectUid,
  );
  if (subject === undefined) {
    throw new HttpError(400, 'subject_not_found', 'Subject is not registered');
  }
  if (subject.status !== 'active') {
    throw new HttpError(409, 'subject_inactive', 'Subject is not active');
  }
  return subject;
}

export async function createRoleAssignment(
  store: DevelopmentStore,
  input: RoleAssignmentInput,
  context: AssignmentMutationContext,
): Promise<RoleAssignmentRecord> {
  const now = context.now ?? new Date();
  const scope = input.scope ?? publicScope;
  validateScope(scope);
  validateExpiry(input.expiresAt, now);
  if (
    input.roleKey === SUPER_ADMIN_ROLE_KEY &&
    (scope.type !== publicScope.type || scope.id !== publicScope.id)
  ) {
    throw new HttpError(
      400,
      'invalid_super_admin_scope',
      'Platform super administrator assignments must use public scope',
    );
  }

  return store.transaction(async (transactionStore) => {
    await requireActiveSubject(transactionStore, input.subjectUid);
    const role = exact(
      await transactionStore.roles.list({ query: input.roleKey }),
      (candidate) => candidate.key === input.roleKey,
    );
    if (role === undefined) {
      throw new HttpError(400, 'role_definition_not_found', 'Role definition is not registered');
    }
    if (role.status !== 'active') {
      throw new HttpError(409, 'role_definition_inactive', 'Role definition is not active');
    }

    const assignment = await transactionStore.roleAssignments.create({
      subjectUid: input.subjectUid,
      roleKey: input.roleKey,
      expiresAt: input.expiresAt ?? null,
      status: 'active',
      ownerUid: context.actorUid,
      scope,
    });
    await recordAuditEvent(transactionStore, {
      actorUid: context.actorUid,
      action: 'admin.role_assignment.grant',
      resourceType: 'role_assignment',
      resourceId: assignment.id,
      details: {
        subjectUid: assignment.subjectUid,
        roleKey: assignment.roleKey,
        scope: assignment.scope,
        expiresAt: assignment.expiresAt,
        status: assignment.status,
      },
    });
    return assignment;
  });
}

export async function createTagAssignment(
  store: DevelopmentStore,
  input: TagAssignmentInput,
  context: AssignmentMutationContext,
): Promise<TagAssignmentRecord> {
  const now = context.now ?? new Date();
  const scope = input.scope ?? publicScope;
  validateExpiry(input.expiresAt, now);

  return store.transaction(async (transactionStore) => {
    await requireActiveSubject(transactionStore, input.subjectUid);
    const definition = exact(
      await transactionStore.tagDefinitions.list({ query: input.tagKey }),
      (candidate) => candidate.key === input.tagKey,
    );
    if (definition === undefined) {
      throw new HttpError(400, 'tag_definition_not_found', 'Tag definition is not registered');
    }
    if (definition.status !== 'active') {
      throw new HttpError(409, 'tag_definition_inactive', 'Tag definition is not active');
    }
    if (
      definition.requiredScopeType !== null &&
      (scope.type !== definition.requiredScopeType || scope.id === '*')
    ) {
      throw new HttpError(400, 'invalid_tag_scope', 'Tag scope does not match its definition');
    }
    validateScope(scope);

    const assignment = await transactionStore.tagAssignments.create({
      subjectUid: input.subjectUid,
      tagKey: input.tagKey,
      expiresAt: input.expiresAt ?? null,
      status: 'active',
      ownerUid: context.actorUid,
      scope,
    });
    await recordAuditEvent(transactionStore, {
      actorUid: context.actorUid,
      action: 'admin.tag_assignment.grant',
      resourceType: 'tag_assignment',
      resourceId: assignment.id,
      details: {
        subjectUid: assignment.subjectUid,
        tagKey: assignment.tagKey,
        scope: assignment.scope,
        expiresAt: assignment.expiresAt,
        status: assignment.status,
      },
    });
    return assignment;
  });
}

function isCurrent(expiresAt: string | null, now: Date): boolean {
  return expiresAt === null || new Date(expiresAt).getTime() > now.getTime();
}

async function countEffectiveSuperAdmins(
  store: DevelopmentStore,
  roleActive: boolean,
  now: Date,
): Promise<number> {
  if (!roleActive) return 0;
  const activeSubjectUids = new Set(
    (await store.subjects.list({ status: 'active' })).map(({ uid }) => uid),
  );
  return (await store.roleAssignments.list()).filter(
    (assignment) =>
      assignment.roleKey === SUPER_ADMIN_ROLE_KEY &&
      assignment.status === 'active' &&
      assignment.scope.type === 'public' &&
      assignment.scope.id === '*' &&
      isCurrent(assignment.expiresAt, now) &&
      activeSubjectUids.has(assignment.subjectUid),
  ).length;
}

export async function archiveRoleAssignment(
  store: DevelopmentStore,
  assignmentId: string,
  context: AssignmentMutationContext,
): Promise<RoleAssignmentRecord> {
  const now = context.now ?? new Date();
  return store.transaction(async (transactionStore) => {
    const candidate = await transactionStore.roleAssignments.get(assignmentId);
    if (candidate === null) {
      throw new HttpError(404, 'assignment_not_found', 'Role assignment not found');
    }

    let canonicalSuperAdminRole;
    if (candidate.roleKey === SUPER_ADMIN_ROLE_KEY) {
      const role = exact(
        await transactionStore.roles.list({ query: SUPER_ADMIN_ROLE_KEY }),
        ({ key }) => key === SUPER_ADMIN_ROLE_KEY,
      );
      if (role === undefined) {
        throw new Error('Canonical platform super administrator role is missing');
      }
      canonicalSuperAdminRole = await transactionStore.roles.getForUpdate(role.id);
      if (canonicalSuperAdminRole?.key !== SUPER_ADMIN_ROLE_KEY) {
        throw new Error('Failed to lock canonical platform super administrator role');
      }
    }

    const assignment = await transactionStore.roleAssignments.getForUpdate(assignmentId);
    if (assignment === null) {
      throw new HttpError(404, 'assignment_not_found', 'Role assignment not found');
    }
    if (assignment.status !== 'active') {
      throw new HttpError(409, 'assignment_inactive', 'Role assignment is not active');
    }

    if (
      canonicalSuperAdminRole?.status === 'active' &&
      assignment.roleKey === SUPER_ADMIN_ROLE_KEY &&
      assignment.scope.type === 'public' &&
      assignment.scope.id === '*' &&
      isCurrent(assignment.expiresAt, now)
    ) {
      const subject = exact(
        await transactionStore.subjects.list({ query: assignment.subjectUid }),
        ({ uid }) => uid === assignment.subjectUid,
      );
      const effectiveCount = await countEffectiveSuperAdmins(
        transactionStore,
        canonicalSuperAdminRole?.status === 'active',
        now,
      );
      if (subject?.status === 'active' && effectiveCount <= 1) {
        throw new HttpError(
          409,
          'last_super_admin',
          'Cannot revoke the last active platform super administrator',
        );
      }
    }

    const updated = await transactionStore.roleAssignments.update(assignment.id, {
      status: 'inactive',
    });
    if (updated === null) {
      throw new HttpError(404, 'assignment_not_found', 'Role assignment not found');
    }
    await recordAuditEvent(transactionStore, {
      actorUid: context.actorUid,
      action: 'admin.role_assignment.revoke',
      resourceType: 'role_assignment',
      resourceId: assignment.id,
      details: {
        subjectUid: assignment.subjectUid,
        roleKey: assignment.roleKey,
        scope: assignment.scope,
        expiresAt: assignment.expiresAt,
        previousStatus: assignment.status,
        status: updated.status,
      },
    });
    return updated;
  });
}

export async function archiveTagAssignment(
  store: DevelopmentStore,
  assignmentId: string,
  context: AssignmentMutationContext,
): Promise<TagAssignmentRecord> {
  return store.transaction(async (transactionStore) => {
    const assignment = await transactionStore.tagAssignments.getForUpdate(assignmentId);
    if (assignment === null) {
      throw new HttpError(404, 'assignment_not_found', 'Tag assignment not found');
    }
    if (assignment.status !== 'active') {
      throw new HttpError(409, 'assignment_inactive', 'Tag assignment is not active');
    }
    const updated = await transactionStore.tagAssignments.update(assignment.id, {
      status: 'inactive',
    });
    if (updated === null) {
      throw new HttpError(404, 'assignment_not_found', 'Tag assignment not found');
    }
    await recordAuditEvent(transactionStore, {
      actorUid: context.actorUid,
      action: 'admin.tag_assignment.revoke',
      resourceType: 'tag_assignment',
      resourceId: assignment.id,
      details: {
        subjectUid: assignment.subjectUid,
        tagKey: assignment.tagKey,
        scope: assignment.scope,
        expiresAt: assignment.expiresAt,
        previousStatus: assignment.status,
        status: updated.status,
      },
    });
    return updated;
  });
}
