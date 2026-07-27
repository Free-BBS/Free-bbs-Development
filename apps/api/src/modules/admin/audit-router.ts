import type { ApiEnvelope } from '@freebbs-development/contracts';
import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';

import type { AuditLogRecord, DevelopmentStore, Page } from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

const identifier = z.string().trim().min(1).max(128);
const auditQuerySchema = z
  .object({
    actorUid: identifier.optional(),
    action: identifier.optional(),
    resourceType: identifier.optional(),
    resourceId: identifier.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    ({ from, to }) => from === undefined || to === undefined || Date.parse(from) <= Date.parse(to),
    'from must not be later than to',
  );

type AuditQuery = z.infer<typeof auditQuerySchema>;

function send<T>(response: Response, status: number, data: T): void {
  const envelope: ApiEnvelope<T> = {
    data,
    requestId: response.locals.requestId as string,
  };
  response.status(status).json(envelope);
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'invalid_request', 'Request validation failed');
  return result.data;
}

function matches(record: AuditLogRecord, query: AuditQuery): boolean {
  const createdAt = Date.parse(record.createdAt);
  return (
    (query.actorUid === undefined || record.actorUid === query.actorUid) &&
    (query.action === undefined || record.action === query.action) &&
    (query.resourceType === undefined || record.resourceType === query.resourceType) &&
    (query.resourceId === undefined || record.resourceId === query.resourceId) &&
    (query.from === undefined || createdAt >= Date.parse(query.from)) &&
    (query.to === undefined || createdAt <= Date.parse(query.to))
  );
}

async function queryAuditLogs(
  store: DevelopmentStore,
  query: AuditQuery,
): Promise<Page<AuditLogRecord>> {
  const records = (await store.auditLogs.list())
    .filter((record) => matches(record, query))
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id),
    );
  const offset = (query.page - 1) * query.pageSize;
  return {
    items: records.slice(offset, offset + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: records.length,
  };
}

export function createAuditRouter(store: DevelopmentStore): Router {
  const router = Router();

  router.get('/audit-logs', async (request, response) => {
    const query = parse(auditQuerySchema, request.query);
    send(response, 200, await queryAuditLogs(store, query));
  });

  return router;
}
