import type { ApiEnvelope, ScopeRef } from '@freebbs-development/contracts';
import { Router } from 'express';
import { z } from 'zod';

import type { AuthenticationResult, AuthHeaders } from '../../core/auth/auth-middleware.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { InformationService } from './service.js';

import type { Request, Response } from 'express';

type Authenticate = (headers: AuthHeaders) => Promise<AuthenticationResult>;

export interface InformationRouterOptions {
  store: DevelopmentStore;
  authenticate: Authenticate;
}

interface ErrorData {
  error: { code: string; message: string };
}

const identifier = z.string().trim().min(1).max(128);
const title = z.string().trim().min(1).max(200);
const body = z.string().trim().min(1).max(20_000);
const scope = z
  .object({
    type: identifier.regex(/^[a-z][a-z0-9_]*$/),
    id: identifier,
  })
  .strict();
const announcementStatus = z.enum(['draft', 'published', 'archived']);
const consultationStatus = z.enum(['submitted', 'triaged', 'processing', 'resolved', 'closed']);
const listQueryFields = {
  scopeType: identifier.regex(/^[a-z][a-z0-9_]*$/).optional(),
  scopeId: identifier.optional(),
  query: z.string().trim().min(1).max(200).optional(),
};
const announcementQuerySchema = z
  .object({ status: announcementStatus.optional(), ...listQueryFields })
  .strict()
  .refine((value) => (value.scopeType === undefined) === (value.scopeId === undefined));
const consultationQuerySchema = z
  .object({ status: consultationStatus.optional(), ...listQueryFields })
  .strict()
  .refine((value) => (value.scopeType === undefined) === (value.scopeId === undefined));
const announcementCreateSchema = z
  .object({
    title,
    body,
    status: announcementStatus.default('draft'),
    scope: scope.default({ type: 'public', id: '*' }),
  })
  .strict();
const announcementPatchSchema = z
  .object({
    id: identifier,
    title: title.optional(),
    body: body.optional(),
    status: announcementStatus.optional(),
    scope: scope.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.status !== undefined ||
      value.scope !== undefined,
  );
const consultationCreateSchema = z.object({ title, body }).strict();
const consultationPatchSchema = z
  .object({
    id: identifier,
    title: title.optional(),
    body: body.optional(),
    status: consultationStatus.optional(),
  })
  .strict()
  .refine(
    (value) => value.title !== undefined || value.body !== undefined || value.status !== undefined,
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
  options: InformationRouterOptions,
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
  options: InformationRouterOptions,
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

function allowed(
  actor: AuthorizationContext,
  action: string,
  resource: 'announcement' | 'consultation',
  scopeRef?: ScopeRef,
): boolean {
  return authorize(actor, { action, resource, scope: scopeRef }).allowed;
}

function forbid(response: Response, message = 'Information permission is required'): void {
  send<ErrorData>(response, 403, { error: { code: 'forbidden', message } });
}

export function createInformationRouter(options: InformationRouterOptions): Router {
  const router = Router();
  const service = new InformationService(options.store);

  router.use(async (_request, response, next) => {
    try {
      const record = (await options.store.modules.list({ query: 'information' })).find(
        (candidate) => candidate.moduleId === 'information',
      );
      if (record === undefined || !record.enabled || record.status !== 'enabled') {
        send<ErrorData>(response, 503, {
          error: { code: 'module_disabled', message: 'Information module is disabled' },
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/announcements', async (request, response) => {
    const filters = parse(announcementQuerySchema, request.query);
    const authentication = await optionalActor(options, request, response);
    if (authentication === null) return;
    const scopeRef = requestedScope(filters);
    const canMaintain =
      authentication.actor !== null &&
      (allowed(authentication.actor, 'information.announcement.create', 'announcement', scopeRef) ||
        allowed(
          authentication.actor,
          'information.announcement.publish',
          'announcement',
          scopeRef,
        ));
    send(response, 200, await service.listAnnouncements(filters, !canMaintain));
  });

  router.post('/announcements', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(announcementCreateSchema, request.body);
    if (!allowed(actor, 'information.announcement.create', 'announcement', input.scope)) {
      forbid(response);
      return;
    }
    if (
      input.status !== 'draft' &&
      !allowed(actor, 'information.announcement.publish', 'announcement', input.scope)
    ) {
      forbid(response, 'Announcement publication permission is required');
      return;
    }
    send(response, 201, await service.createAnnouncement(actor.uid, input));
  });

  router.patch('/announcements', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(announcementPatchSchema, request.body);
    const { id, ...patch } = input;
    const updated = await service.updateAnnouncement(actor, id, patch);
    if (updated === null)
      throw new HttpError(404, 'announcement_not_found', 'Announcement not found');
    send(response, 200, updated);
  });

  router.get('/consultations', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const filters = parse(consultationQuerySchema, request.query);
    const scopeRef = requestedScope(filters);
    const canReadAll =
      allowed(actor, 'information.consultation.read', 'consultation', scopeRef) ||
      allowed(actor, 'information.consultation.triage', 'consultation', scopeRef);
    send(
      response,
      200,
      await service.listConsultations(filters, canReadAll ? undefined : actor.uid),
    );
  });

  router.post('/consultations', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(consultationCreateSchema, request.body);
    const personalScope = { type: 'user', id: actor.uid } as const;
    if (!allowed(actor, 'information.consultation.create', 'consultation', personalScope)) {
      forbid(response, 'Consultation submission permission is required');
      return;
    }
    send(response, 201, await service.createConsultation(actor.uid, input));
  });

  router.patch('/consultations', async (request, response) => {
    const actor = await requireActor(options, request, response);
    if (actor === null) return;
    const input = parse(consultationPatchSchema, request.body);
    const { id, ...patch } = input;
    const updated = await service.updateConsultation(actor, id, patch);
    if (updated === null)
      throw new HttpError(404, 'consultation_not_found', 'Consultation not found');
    send(response, 200, updated);
  });

  return router;
}
