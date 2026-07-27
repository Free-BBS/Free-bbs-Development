import type { ApiEnvelope, ScopeRef } from '@freebbs-development/contracts';
import { Router } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { EventsService } from './service.js';

import type { Request, Response } from 'express';

type Authenticate = (headers: AuthHeaders) => Promise<AuthenticationResult>;
export interface EventsRouterOptions {
  store: DevelopmentStore;
  authenticate: Authenticate;
}
interface ErrorData {
  error: { code: string; message: string };
}

const identifier = z.string().trim().min(1).max(128);
const scope = z.object({ type: identifier.regex(/^[a-z][a-z0-9_]*$/), id: identifier }).strict();
const status = z.enum([
  'draft',
  'pending',
  'approved',
  'rejected',
  'published',
  'finished',
  'archived',
]);
const nullableDateTime = z.string().datetime({ offset: true }).nullable();
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
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20_000),
    clubId: identifier.nullable().default(null),
    startsAt: nullableDateTime.default(null),
    status: z.literal('draft').default('draft'),
    scope: scope.default({ type: 'public', id: '*' }),
  })
  .strict();
const patchSchema = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(20_000).optional(),
    clubId: identifier.nullable().optional(),
    startsAt: nullableDateTime.optional(),
    scope: scope.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.clubId !== undefined ||
      value.startsAt !== undefined ||
      value.scope !== undefined,
  );
const routeSchema = z.object({ activityId: identifier }).strict();
const transitionSchema = z.object({ to: status }).strict();
const technicalSupportSchema = z
  .object({
    to: z.enum(['requested', 'confirmed']),
    note: z.string().trim().min(1).max(20_000).nullable().optional(),
  })
  .strict();
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
  options: EventsRouterOptions,
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
  return authorize(actor, { action, resource: 'activity', scope: scopeRef }).allowed;
}
function forbid(response: Response): void {
  send<ErrorData>(response, 403, {
    error: { code: 'forbidden', message: 'Event permission is required' },
  });
}

export function createEventsRouter(options: EventsRouterOptions): Router {
  const router = Router();
  const service = new EventsService(options.store);

  router.use(async (_request, response, next) => {
    try {
      const module = (await options.store.modules.list({ query: 'events' })).find(
        (record) => record.moduleId === 'events',
      );
      if (module === undefined || !module.enabled || module.status !== 'enabled') {
        send<ErrorData>(response, 503, {
          error: { code: 'module_disabled', message: 'Events module is disabled' },
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/activities', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    send(response, 200, await service.list(actor, parse(querySchema, request.query)));
  });

  router.post('/activities', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(createSchema, request.body);
    if (!allowed(actor, 'events.create', input.scope)) return forbid(response);
    send(response, 201, await service.create(actor, input));
  });

  router.patch('/activities', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(patchSchema, request.body);
    const { id, ...patch } = input;
    send(response, 200, await service.update(actor, id, patch));
  });

  router.post('/activities/:activityId/transitions', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { activityId } = parse(routeSchema, request.params);
    const { to } = parse(transitionSchema, request.body);
    send(response, 200, await service.transition(actor, activityId, to));
  });

  router.patch('/activities/:activityId/technical-support', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { activityId } = parse(routeSchema, request.params);
    const input = parse(technicalSupportSchema, request.body);
    send(
      response,
      200,
      await service.updateTechnicalSupport(actor, activityId, input.to, input.note),
    );
  });

  router.get('/activities/:activityId/registrations', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { activityId } = parse(routeSchema, request.params);
    send(response, 200, await service.getRegistration(actor, activityId));
  });

  router.post('/activities/:activityId/registrations', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { activityId } = parse(routeSchema, request.params);
    parse(emptyBodySchema, request.body ?? {});
    send(response, 201, await service.register(actor, activityId));
  });

  router.delete('/activities/:activityId/registrations', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { activityId } = parse(routeSchema, request.params);
    parse(emptyBodySchema, request.body ?? {});
    await service.cancel(actor, activityId);
    response.status(204).end();
  });

  return router;
}
