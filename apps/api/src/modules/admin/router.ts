import type { ApiEnvelope } from '@freebbs-development/contracts';
import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { recordAuditEvent } from '../../core/audit/audit-service.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { listModuleManifests } from '../../core/modules/registry.js';
import { createAssignmentsRouter } from './assignments-router.js';
import { createPermissionsRouter } from './permissions-router.js';
import { modulePatchSchema } from './schemas.js';
import { createSubjectsRouter } from './subjects-router.js';
import { createTagsRouter } from './tags-router.js';

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

  router.use('/subjects', createSubjectsRouter(options.store));
  router.use(createAssignmentsRouter(options.store));
  router.use(createPermissionsRouter(options.store));
  router.use(createTagsRouter(options.store));

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

  router.get('/audit-logs', async (_request, response) => {
    send(response, 200, await options.store.auditLogs.list());
  });

  return router;
}
