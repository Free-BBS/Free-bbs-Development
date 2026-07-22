import type { ApiEnvelope, ScopeRef } from '@freebbs-development/contracts';
import { Router } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import { encodeDateOnly } from '../../core/database/date-codec.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { SportsService } from './service.js';

import type { Request, Response } from 'express';

type Authenticate = (headers: AuthHeaders) => Promise<AuthenticationResult>;
export interface SportsRouterOptions {
  store: DevelopmentStore;
  authenticate: Authenticate;
}
interface ErrorData {
  error: { code: string; message: string };
}

const identifier = z.string().trim().min(1).max(128);
const teamStatus = z.enum(['draft', 'active', 'archived']);
const teamQuerySchema = z
  .object({
    status: teamStatus.optional(),
    scopeType: identifier.regex(/^[a-z][a-z0-9_]*$/).optional(),
    scopeId: identifier.optional(),
    query: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => (value.scopeType === undefined) === (value.scopeId === undefined));
const createTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20_000),
    status: teamStatus.default('draft'),
  })
  .strict();
const patchTeamSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(20_000).optional(),
    status: teamStatus.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.status !== undefined,
  );
const teamRouteSchema = z.object({ teamId: identifier }).strict();
const checkinDate = z.string().refine((value) => {
  try {
    encodeDateOnly(value);
    return true;
  } catch {
    return false;
  }
});
const createCheckinSchema = z.object({ memberUid: identifier, checkinDate }).strict();

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
  options: SportsRouterOptions,
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

function allowedTeam(actor: AuthorizationContext, action: string, scope?: ScopeRef): boolean {
  return authorize(actor, { action, resource: 'sports_team', scope }).allowed;
}

function forbid(response: Response): void {
  send<ErrorData>(response, 403, {
    error: { code: 'forbidden', message: 'Sports team permission is required' },
  });
}

export function createSportsRouter(options: SportsRouterOptions): Router {
  const router = Router();
  const service = new SportsService(options.store);

  router.use(async (_request, response, next) => {
    try {
      const module = (await options.store.modules.list({ query: 'sports' })).find(
        (record) => record.moduleId === 'sports',
      );
      if (module === undefined || !module.enabled || module.status !== 'enabled') {
        send<ErrorData>(response, 503, {
          error: { code: 'module_disabled', message: 'Sports module is disabled' },
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/teams', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    send(response, 200, await service.listTeams(actor, parse(teamQuerySchema, request.query)));
  });

  router.post('/teams', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(createTeamSchema, request.body);
    if (!allowedTeam(actor, 'sports.team.create')) return forbid(response);
    send(response, 201, await service.createTeam(actor, input));
  });

  router.patch('/teams', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(patchTeamSchema, request.body);
    const { id, ...patch } = input;
    send(response, 200, await service.updateTeam(actor, id, patch));
  });

  router.get('/teams/:teamId/checkins', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { teamId } = parse(teamRouteSchema, request.params);
    send(response, 200, await service.listCheckins(actor, teamId));
  });

  router.post('/teams/:teamId/checkins', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const { teamId } = parse(teamRouteSchema, request.params);
    const input = parse(createCheckinSchema, request.body);
    const result = await service.createCheckin(actor, teamId, input);
    send(response, result.created ? 201 : 200, result.record);
  });

  return router;
}
