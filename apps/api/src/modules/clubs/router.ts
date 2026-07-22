import type { ApiEnvelope, ScopeRef } from '@freebbs-development/contracts';
import { Router } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { ClubsService } from './service.js';

import type { Request, Response } from 'express';

type Authenticate = (headers: AuthHeaders) => Promise<AuthenticationResult>;
export interface ClubsRouterOptions {
  store: DevelopmentStore;
  authenticate: Authenticate;
}
interface ErrorData {
  error: { code: string; message: string };
}

const identifier = z.string().trim().min(1).max(128);
const scope = z.object({ type: identifier.regex(/^[a-z][a-z0-9_]*$/), id: identifier }).strict();
const status = z.enum(['draft', 'active', 'archived']);
const querySchema = z
  .object({
    status: status.optional(),
    scopeType: identifier.regex(/^[a-z][a-z0-9_]*$/).optional(),
    scopeId: identifier.optional(),
    query: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => (value.scopeType === undefined) === (value.scopeId === undefined));
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20_000),
    status: status.default('draft'),
    scope: scope.default({ type: 'public', id: '*' }),
  })
  .strict();
const patchSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(20_000).optional(),
    status: status.optional(),
    scope: scope.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.scope !== undefined,
  );
const routeSchema = z.object({ clubId: identifier }).strict();
const emptyBodySchema = z.object({}).strict();

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'invalid_request', 'Request validation failed');
  return result.data;
}
function send<T>(response: Response, statusCode: number, data: T): void {
  const envelope: ApiEnvelope<T> = { data, requestId: response.locals.requestId as string };
  response.status(statusCode).json(envelope);
}
function sendAuthError(response: Response, result: Exclude<AuthenticationResult, { status: 200 }>) {
  send<ErrorData>(response, result.status, {
    error: { code: result.code, message: result.message },
  });
}
async function requireActor(
  options: ClubsRouterOptions,
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
function allowed(actor: AuthorizationContext, action: string, scopeRef?: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'club', scope: scopeRef }).allowed;
}
function forbid(response: Response): void {
  send<ErrorData>(response, 403, {
    error: { code: 'forbidden', message: 'Club permission is required' },
  });
}

export function createClubsRouter(options: ClubsRouterOptions): Router {
  const router = Router();
  const service = new ClubsService(options.store);

  router.use(async (_request, response, next) => {
    try {
      const module = (await options.store.modules.list({ query: 'clubs' })).find(
        (record) => record.moduleId === 'clubs',
      );
      if (module === undefined || !module.enabled || module.status !== 'enabled') {
        send<ErrorData>(response, 503, {
          error: { code: 'module_disabled', message: 'Clubs module is disabled' },
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const filters = parse(querySchema, request.query);
    send(response, 200, await service.list(actor, filters));
  });

  router.post('/', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(createSchema, request.body);
    if (!allowed(actor, 'clubs.create', input.scope)) return forbid(response);
    send(response, 201, await service.create(actor, input));
  });

  router.patch('/', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(patchSchema, request.body);
    const { id, ...patch } = input;
    send(response, 200, await service.update(actor, id, patch));
  });

  router.post('/:clubId/memberships', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { clubId } = parse(routeSchema, request.params);
    parse(emptyBodySchema, request.body ?? {});
    send(response, 201, await service.join(actor, clubId));
  });

  router.delete('/:clubId/memberships', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { clubId } = parse(routeSchema, request.params);
    parse(emptyBodySchema, request.body ?? {});
    await service.leave(actor, clubId);
    response.status(204).end();
  });

  return router;
}
