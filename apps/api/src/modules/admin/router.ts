import type { ApiEnvelope } from '@freebbs-development/contracts';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { recordAuditEvent } from '../../core/audit/audit-service.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { listModuleManifests } from '../../core/modules/registry.js';
import {
  assignmentIdSchema,
  modulePatchSchema,
  roleAssignmentSchema,
  tagAssignmentSchema,
} from './schemas.js';

type Authenticate = (headers: AuthHeaders) => Promise<AuthenticationResult>;

export interface AdminRouterOptions {
  store: DevelopmentStore;
  authenticate: Authenticate;
}

interface ErrorData {
  error: { code: string; message: string };
}

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

function actor(response: Response): AuthorizationContext {
  return response.locals.user as AuthorizationContext;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();

  router.use(async (request, response, next) => {
    try {
      const result = await options.authenticate(request.headers);
      if (result.status !== 200) {
        send<ErrorData>(response, result.status, {
          error: { code: result.code, message: result.message },
        });
        return;
      }
      const decision = authorize(result.user, { action: 'admin.manage', resource: 'admin' });
      if (!decision.allowed) {
        send<ErrorData>(response, 403, {
          error: { code: 'forbidden', message: 'Administrative permission is required' },
        });
        return;
      }
      response.locals.user = result.user;
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/modules', async (_request, response) => {
    send(response, 200, await listModuleManifests(options.store));
  });

  router.patch('/modules', async (request, response) => {
    const input = parse(modulePatchSchema, request.body);
    await options.store.transaction(async (transactionStore) => {
      const record = (await transactionStore.modules.list({ query: input.moduleId })).find(
        (candidate) => candidate.moduleId === input.moduleId,
      );
      if (record === undefined) throw new HttpError(404, 'module_not_found', 'Module not found');
      const updated = await transactionStore.modules.update(record.id, {
        enabled: input.enabled,
        status: input.enabled ? 'enabled' : 'disabled',
      });
      if (updated === null) throw new HttpError(404, 'module_not_found', 'Module not found');
      await recordAuditEvent(transactionStore, {
        actorUid: actor(response).uid,
        action: 'admin.module.update',
        resourceType: 'module',
        resourceId: input.moduleId,
        details: { enabled: input.enabled },
      });
    });
    const manifest = (await listModuleManifests(options.store)).find(
      (candidate) => candidate.id === input.moduleId,
    );
    if (manifest === undefined) throw new HttpError(404, 'module_not_found', 'Module not found');
    send(response, 200, manifest);
  });

  router.get('/role-assignments', async (_request, response) => {
    send(response, 200, await options.store.roleAssignments.list());
  });

  router.post('/role-assignments', async (request, response) => {
    const input = parse(roleAssignmentSchema, request.body);
    const created = await options.store.transaction(async (transactionStore) => {
      const assignment = await transactionStore.roleAssignments.create({
        subjectUid: input.subjectUid,
        roleKey: input.roleKey,
        expiresAt: input.expiresAt ?? null,
        status: 'active',
        ownerUid: actor(response).uid,
        scope: input.scope ?? { type: 'public', id: '*' },
      });
      await recordAuditEvent(transactionStore, {
        actorUid: actor(response).uid,
        action: 'admin.role_assignment.grant',
        resourceType: 'role_assignment',
        resourceId: assignment.id,
        details: { subjectUid: input.subjectUid, roleKey: input.roleKey, scope: assignment.scope },
      });
      return assignment;
    });
    send(response, 201, created);
  });

  router.delete('/role-assignments/:assignmentId', async (request: Request, response) => {
    const assignmentId = parse(assignmentIdSchema, request.params.assignmentId);
    await options.store.transaction(async (transactionStore) => {
      const assignment = await transactionStore.roleAssignments.get(assignmentId);
      if (assignment === null)
        throw new HttpError(404, 'assignment_not_found', 'Role assignment not found');
      if (!(await transactionStore.roleAssignments.delete(assignmentId))) {
        throw new HttpError(404, 'assignment_not_found', 'Role assignment not found');
      }
      await recordAuditEvent(transactionStore, {
        actorUid: actor(response).uid,
        action: 'admin.role_assignment.revoke',
        resourceType: 'role_assignment',
        resourceId: assignmentId,
        details: { subjectUid: assignment.subjectUid, roleKey: assignment.roleKey },
      });
    });
    send(response, 200, { id: assignmentId, deleted: true });
  });

  router.get('/tag-assignments', async (_request, response) => {
    send(response, 200, await options.store.tagAssignments.list());
  });

  router.post('/tag-assignments', async (request, response) => {
    const input = parse(tagAssignmentSchema, request.body);
    const created = await options.store.transaction(async (transactionStore) => {
      const assignment = await transactionStore.tagAssignments.create({
        subjectUid: input.subjectUid,
        tagKey: input.tagKey,
        expiresAt: input.expiresAt ?? null,
        status: 'active',
        ownerUid: actor(response).uid,
        scope: input.scope ?? { type: 'public', id: '*' },
      });
      await recordAuditEvent(transactionStore, {
        actorUid: actor(response).uid,
        action: 'admin.tag_assignment.grant',
        resourceType: 'tag_assignment',
        resourceId: assignment.id,
        details: { subjectUid: input.subjectUid, tagKey: input.tagKey, scope: assignment.scope },
      });
      return assignment;
    });
    send(response, 201, created);
  });

  router.delete('/tag-assignments/:assignmentId', async (request: Request, response) => {
    const assignmentId = parse(assignmentIdSchema, request.params.assignmentId);
    await options.store.transaction(async (transactionStore) => {
      const assignment = await transactionStore.tagAssignments.get(assignmentId);
      if (assignment === null)
        throw new HttpError(404, 'assignment_not_found', 'Tag assignment not found');
      if (!(await transactionStore.tagAssignments.delete(assignmentId))) {
        throw new HttpError(404, 'assignment_not_found', 'Tag assignment not found');
      }
      await recordAuditEvent(transactionStore, {
        actorUid: actor(response).uid,
        action: 'admin.tag_assignment.revoke',
        resourceType: 'tag_assignment',
        resourceId: assignmentId,
        details: {
          subjectUid: assignment.subjectUid,
          tagKey: assignment.tagKey,
          scope: assignment.scope,
        },
      });
    });
    send(response, 200, { id: assignmentId, deleted: true });
  });

  router.get('/audit-logs', async (_request, response) => {
    send(response, 200, await options.store.auditLogs.list());
  });

  return router;
}
