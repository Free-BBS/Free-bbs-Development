import { MODULE_IDS, ROLE_KEYS } from '@freebbs-development/contracts';
import { z } from 'zod';

const identifier = z.string().trim().min(1).max(128);
const scopeSchema = z
  .object({
    type: identifier.regex(/^[a-z][a-z0-9_]*$/),
    id: identifier,
  })
  .strict();
const expiresAt = z.string().datetime({ offset: true }).nullable().optional();

export const paginationQuerySchema = z
  .object({
    query: identifier.optional(),
    status: identifier.optional(),
    scopeType: identifier.optional(),
    scopeId: identifier.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const subjectUidSchema = identifier;

export const modulePatchSchema = z
  .object({
    moduleId: z.enum(MODULE_IDS),
    enabled: z.boolean(),
  })
  .strict();

export const roleAssignmentSchema = z
  .object({
    subjectUid: identifier,
    roleKey: z.enum(ROLE_KEYS),
    expiresAt,
    scope: scopeSchema.optional(),
  })
  .strict();

export const tagAssignmentSchema = z
  .object({
    subjectUid: identifier,
    tagKey: identifier.regex(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/),
    expiresAt,
    scope: scopeSchema.optional(),
  })
  .strict();

export const assignmentIdSchema = identifier;
