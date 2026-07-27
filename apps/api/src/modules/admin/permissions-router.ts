import type { ApiEnvelope, PermissionAction, RoleKey } from '@freebbs-development/contracts';
import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { BUILT_IN_PERMISSIONS } from '../../core/bootstrap/built-in-definitions.js';
import type { DevelopmentStore, RolePermissionRecord } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import {
  permissionBindingSchema,
  replacePermissionBindingsSchema,
  roleKeySchema,
} from './schemas.js';
import { adminActor } from './subjects-router.js';

export type PermissionBindingInput = z.infer<typeof permissionBindingSchema>;

const catalogPermissionIdentities = new Set(
  BUILT_IN_PERMISSIONS.map(({ action, resource }) => permissionIdentity(action, resource)),
);

function send<T>(response: Response, status: number, data: T): void {
  const envelope: ApiEnvelope<T> = {
    data,
    requestId: response.locals.requestId as string,
  };
  response.status(status).json(envelope);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'invalid_request', 'Request validation failed');
  return result.data;
}

function permissionIdentity(action: string, resource: string): string {
  return `${action}\u0000${resource}`;
}

export function permissionBindingTuple(binding: PermissionBindingInput): string {
  return [binding.action, binding.resource, binding.scope.type, binding.scope.id].join('\u0000');
}

export function permissionBindingIdentity(binding: PermissionBindingInput) {
  return {
    action: binding.action,
    resource: binding.resource,
    effect: binding.effect,
    scope: binding.scope,
  };
}

function validateRoleBindingScope(binding: PermissionBindingInput): void {
  if (binding.scope.type === 'public' && binding.scope.id !== '*') {
    throw new HttpError(400, 'invalid_permission_scope', 'Permission scope is not valid');
  }
}

export async function validateRegisteredPermissionBindings(
  store: DevelopmentStore,
  bindings: readonly PermissionBindingInput[],
): Promise<void> {
  const definitions = await store.permissions.list();
  for (const binding of bindings) {
    const identity = permissionIdentity(binding.action, binding.resource);
    if (!catalogPermissionIdentities.has(identity)) {
      throw new HttpError(
        400,
        'permission_definition_not_found',
        'Permission definition is not registered',
      );
    }
    const registered = definitions.filter(
      ({ action, resource }) => action === binding.action && resource === binding.resource,
    );
    if (registered.length === 0) {
      throw new HttpError(
        400,
        'permission_definition_not_found',
        'Permission definition is not registered',
      );
    }
    if (!registered.some(({ status }) => status === 'active')) {
      throw new HttpError(
        409,
        'permission_definition_inactive',
        'Permission definition is not active',
      );
    }
  }
}

async function replaceRolePermissions(
  store: DevelopmentStore,
  roleKey: RoleKey,
  bindings: readonly PermissionBindingInput[],
  actorUid: string,
): Promise<RolePermissionRecord[]> {
  return store.transaction(async (transactionStore) => {
    const role = (await transactionStore.roles.listForUpdate({ query: roleKey })).find(
      ({ key }) => key === roleKey,
    );
    if (role === undefined) throw new HttpError(404, 'role_not_found', 'Role not found');
    if (role.status !== 'active') {
      throw new HttpError(409, 'role_definition_inactive', 'Role definition is not active');
    }

    const existing = (
      await transactionStore.rolePermissions.listForUpdate({ query: roleKey })
    ).filter((binding) => binding.roleKey === roleKey);
    for (const binding of bindings) validateRoleBindingScope(binding);
    await validateRegisteredPermissionBindings(transactionStore, bindings);

    const desiredByTuple = new Map(
      bindings.map((binding) => [permissionBindingTuple(binding), binding]),
    );
    const activeBefore = existing
      .filter(({ status }) => status === 'active')
      .map(permissionBindingIdentity);
    const replaced: RolePermissionRecord[] = [];
    const restoredTuples = new Set<string>();

    for (const current of existing) {
      const tuple = permissionBindingTuple(current);
      const desired = desiredByTuple.get(tuple);
      if (desired === undefined) {
        if (current.status === 'active') {
          const archived = await transactionStore.rolePermissions.update(current.id, {
            status: 'inactive',
            ownerUid: actorUid,
          });
          if (archived === null) throw new Error('Failed to archive role permission binding');
        }
        continue;
      }
      const restored = await transactionStore.rolePermissions.update(current.id, {
        effect: desired.effect,
        status: 'active',
        ownerUid: actorUid,
      });
      if (restored === null) throw new Error('Failed to restore role permission binding');
      replaced.push(restored);
      restoredTuples.add(tuple);
    }

    for (const desired of bindings) {
      const tuple = permissionBindingTuple(desired);
      if (restoredTuples.has(tuple)) continue;
      replaced.push(
        await transactionStore.rolePermissions.create({
          roleKey,
          action: desired.action as PermissionAction,
          resource: desired.resource,
          effect: desired.effect,
          status: 'active',
          ownerUid: actorUid,
          scope: desired.scope,
        }),
      );
    }

    const byTuple = new Map(replaced.map((binding) => [permissionBindingTuple(binding), binding]));
    const ordered = bindings.map((binding) => {
      const record = byTuple.get(permissionBindingTuple(binding));
      if (record === undefined) throw new Error('Failed to replace role permission binding');
      return record;
    });
    await recordAuditEvent(transactionStore, {
      actorUid,
      action: 'admin.role_permissions.replace',
      resourceType: 'role',
      resourceId: roleKey,
      details: {
        oldBindings: activeBefore,
        newBindings: bindings.map(permissionBindingIdentity),
      },
    });
    return ordered;
  });
}

export function createPermissionsRouter(store: DevelopmentStore): Router {
  const router = Router();

  router.get('/roles', async (_request, response) => {
    send(response, 200, await store.roles.list());
  });

  router.get('/permissions', async (_request, response) => {
    send(response, 200, await store.permissions.list());
  });

  router.get('/role-permissions', async (_request, response) => {
    send(response, 200, await store.rolePermissions.list());
  });

  router.put('/roles/:roleKey/permissions', async (request, response) => {
    const roleKey = parse(roleKeySchema, request.params.roleKey);
    const input = parse(replacePermissionBindingsSchema, request.body);
    const bindings = await replaceRolePermissions(
      store,
      roleKey,
      input.bindings,
      adminActor(response).uid,
    );
    send(response, 200, { roleKey, bindings });
  });

  return router;
}
