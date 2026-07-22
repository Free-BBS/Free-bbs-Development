import type { ApiEnvelope, ScopeRef } from '@freebbs-development/contracts';
import { Router } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { LiaisonService } from './service.js';

import type { Request, Response } from 'express';

type Authenticate = (headers: AuthHeaders) => Promise<AuthenticationResult>;

export interface LiaisonRouterOptions {
  store: DevelopmentStore;
  authenticate: Authenticate;
}

interface ErrorData {
  error: { code: string; message: string };
}

const identifier = z.string().trim().min(1).max(128);
const name = z.string().trim().min(1).max(200);
const description = z.string().trim().min(1).max(20_000);
const category = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);
const visibility = z.enum(['public', 'organization', 'restricted']);
const status = z.enum(['active', 'archived']);
const scope = z
  .object({
    type: identifier.regex(/^[a-z][a-z0-9_]*$/),
    id: identifier,
  })
  .strict();
const querySchema = z
  .object({
    visibility: visibility.optional(),
    status: status.optional(),
    scopeType: identifier.regex(/^[a-z][a-z0-9_]*$/).optional(),
    scopeId: identifier.optional(),
    query: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => (value.scopeType === undefined) === (value.scopeId === undefined));
const createSchema = z
  .object({
    name,
    description,
    category,
    visibility,
    status: status.default('active'),
    scope,
  })
  .strict();
const patchSchema = z
  .object({
    id: identifier,
    name: name.optional(),
    description: description.optional(),
    category: category.optional(),
    visibility: visibility.optional(),
    status: status.optional(),
    scope: scope.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.category !== undefined ||
      value.visibility !== undefined ||
      value.status !== undefined ||
      value.scope !== undefined,
  );

function send<T>(response: Response, statusCode: number, data: T): void {
  const envelope: ApiEnvelope<T> = {
    data,
    requestId: response.locals.requestId as string,
  };
  response.status(statusCode).json(envelope);
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'invalid_request', 'Request validation failed');
  return result.data;
}

function sendAuthError(response: Response, result: Exclude<AuthenticationResult, { status: 200 }>) {
  send<ErrorData>(response, result.status, {
    error: { code: result.code, message: result.message },
  });
}

async function requireActor(
  options: LiaisonRouterOptions,
  request: Request,
  response: Response,
): Promise<AuthorizationContext | null> {
  const result = await options.authenticate(request.headers);
  if (result.status !== 200) {
    sendAuthError(response, result);
    return null;
  }
  return result.user;
}

async function optionalActor(
  options: LiaisonRouterOptions,
  request: Request,
  response: Response,
): Promise<{ actor: AuthorizationContext | null } | null> {
  const result = await options.authenticate(request.headers);
  if (result.status === 200) return { actor: result.user };
  if (result.code === 'missing_identity') return { actor: null };
  sendAuthError(response, result);
  return null;
}

function requestedScope(input: { scopeType?: string; scopeId?: string }): ScopeRef | undefined {
  return input.scopeType === undefined ? undefined : { type: input.scopeType, id: input.scopeId! };
}

function readDecision(actor: AuthorizationContext, scopeRef?: ScopeRef) {
  return authorize(actor, {
    action: 'liaison.resource.read',
    resource: 'liaison_resource',
    scope: scopeRef,
  });
}

function allowed(actor: AuthorizationContext, action: string, scopeRef: ScopeRef): boolean {
  return authorize(actor, {
    action,
    resource: 'liaison_resource',
    scope: scopeRef,
  }).allowed;
}

function validateVisibilityScope(visibilityValue: string, scopeValue: ScopeRef): void {
  const valid =
    visibilityValue === 'public'
      ? scopeValue.type === 'public' && scopeValue.id === '*'
      : visibilityValue === 'organization'
        ? scopeValue.type === 'organization' && scopeValue.id !== '*'
        : scopeValue.type !== 'public' && scopeValue.id !== '*';
  if (!valid) {
    throw new HttpError(400, 'invalid_visibility_scope', 'Visibility and scope do not match');
  }
}

function forbid(response: Response, message = 'Liaison permission is required'): void {
  send<ErrorData>(response, 403, { error: { code: 'forbidden', message } });
}

export function createLiaisonRouter(options: LiaisonRouterOptions): Router {
  const router = Router();
  const service = new LiaisonService(options.store);

  router.use(async (_request, response, next) => {
    try {
      const record = (await options.store.modules.list({ query: 'liaison' })).find(
        (candidate) => candidate.moduleId === 'liaison',
      );
      if (record === undefined || !record.enabled || record.status !== 'enabled') {
        send<ErrorData>(response, 503, {
          error: { code: 'module_disabled', message: 'Liaison module is disabled' },
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/resources', async (request, response) => {
    const filters = parse(querySchema, request.query);
    const authentication = await optionalActor(options, request, response);
    if (authentication === null) return;
    if (authentication.actor === null) {
      if (filters.visibility !== undefined && filters.visibility !== 'public') {
        send<ErrorData>(response, 401, {
          error: { code: 'missing_identity', message: 'Authentication is required' },
        });
        return;
      }
      send(response, 200, await service.listPublic(filters));
      return;
    }

    const scopeRef = requestedScope(filters);
    if (filters.visibility === 'organization') {
      if (!readDecision(authentication.actor, scopeRef).allowed) {
        forbid(response);
        return;
      }
    }
    if (filters.visibility === 'restricted') {
      const decision = readDecision(authentication.actor, scopeRef);
      if (!decision.allowed || decision.reason === 'base-role-grant') {
        await service.auditDeniedRead(authentication.actor.uid, scopeRef);
        forbid(response, 'Restricted liaison permission is required');
        return;
      }
    }
    send(response, 200, await service.listAuthorized(authentication.actor, filters));
  });

  router.post('/resources', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(createSchema, request.body);
    validateVisibilityScope(input.visibility, input.scope);
    if (!allowed(actor, 'liaison.resource.create', input.scope)) {
      forbid(response);
      return;
    }
    send(response, 201, await service.create(actor.uid, input));
  });

  router.patch('/resources', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(patchSchema, request.body);
    const { id, ...patch } = input;
    const updated = await service.update(actor, id, patch);
    if (updated === null) {
      throw new HttpError(404, 'liaison_resource_not_found', 'Liaison resource not found');
    }
    send(response, 200, updated);
  });

  return router;
}
