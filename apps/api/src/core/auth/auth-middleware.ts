import { IdentityProviderUnavailableError } from './auth-client.js';

import { validateTagScope } from '@freebbs-development/contracts';
import type { PermissionTag, ScopeRef, UserContext } from '@freebbs-development/contracts';
import { ROLE_PERMISSION_CATALOG } from '../authorization/permission-catalog.js';
import type { AuthorizationContext, AuthorizationPolicy } from '../authorization/policy.js';
import type { DevelopmentStore } from '../database/types.js';
import type { AuthClient } from './auth-client.js';

export type AuthHeaders = Readonly<Record<string, string | string[] | undefined>>;

export type AuthenticationResult =
  | { status: 200; user: AuthorizationContext }
  | {
      status: 401 | 503;
      code: 'missing_identity' | 'invalid_identity' | 'identity_provider_unavailable';
      message: string;
    };

export interface AuthMiddlewareOptions {
  authClient: AuthClient;
  mode: 'main' | 'demo';
  store?: DevelopmentStore;
  now?: () => Date;
}

function firstHeader(headers: AuthHeaders, name: string): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0];
  if (direct !== undefined) return direct;
  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
  return Array.isArray(found) ? found[0] : found;
}

function readCredential(
  headers: AuthHeaders,
  mode: 'main' | 'demo',
): { ok: true; value: string } | { ok: false; missing: boolean } {
  if (mode === 'demo') {
    const value = firstHeader(headers, 'x-demo-user')?.trim();
    return value ? { ok: true, value } : { ok: false, missing: true };
  }

  const authorization = firstHeader(headers, 'authorization');
  if (authorization === undefined || authorization.trim() === '') {
    return { ok: false, missing: true };
  }
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ? { ok: true, value: match[1] } : { ok: false, missing: false };
}

function isCurrent(expiresAt: string | null | undefined, now: Date): boolean {
  if (expiresAt === null || expiresAt === undefined) return true;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function isGlobalScope(scope: ScopeRef): boolean {
  return scope.type === 'public' && scope.id === '*';
}

function tagIdentity(tag: PermissionTag): string {
  return `${tag.key}|${tag.scope?.type ?? ''}|${tag.scope?.id ?? ''}`;
}

function expiryRank(expiresAt: string | null | undefined): number {
  if (expiresAt === null || expiresAt === undefined) return Number.POSITIVE_INFINITY;
  const value = Date.parse(expiresAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function deduplicateCurrentTags(tags: readonly PermissionTag[], now: Date): PermissionTag[] {
  const selected = new Map<string, PermissionTag>();
  for (const tag of tags) {
    if (!validateTagScope(tag.key, tag.scope) || !isCurrent(tag.expiresAt, now)) continue;
    const key = tagIdentity(tag);
    const previous = selected.get(key);
    if (previous === undefined || expiryRank(tag.expiresAt) > expiryRank(previous.expiresAt)) {
      selected.set(key, tag);
    }
  }
  return [...selected.values()];
}

async function hydratePlatformAccess(
  user: UserContext,
  store: DevelopmentStore | undefined,
  now: Date,
): Promise<AuthorizationContext> {
  const [roleAssignments, tagAssignments] =
    store === undefined
      ? [[], []]
      : await Promise.all([
          store.roleAssignments.list({ query: user.uid }),
          store.tagAssignments.list({ query: user.uid }),
        ]);
  const activeRoles = roleAssignments.filter(
    (assignment) =>
      assignment.subjectUid === user.uid &&
      assignment.status === 'active' &&
      isCurrent(assignment.expiresAt, now),
  );
  const roles = [...user.roles];
  const generatedPolicies: AuthorizationPolicy[] = [];
  for (const assignment of activeRoles) {
    const rules = ROLE_PERMISSION_CATALOG[assignment.roleKey];
    if (rules === undefined) continue;
    if (isGlobalScope(assignment.scope)) {
      roles.push(assignment.roleKey);
      continue;
    }
    for (const [ruleIndex, rule] of rules.entries()) {
      generatedPolicies.push({
        id: `role-assignment:${assignment.id}:${ruleIndex}`,
        action: rule.action,
        resource: rule.resource,
        effect: 'allow',
        scope: assignment.scope,
        expiresAt: assignment.expiresAt,
      });
    }
  }
  const storedTags = tagAssignments
    .filter(
      (assignment) =>
        assignment.subjectUid === user.uid &&
        assignment.status === 'active' &&
        isCurrent(assignment.expiresAt, now) &&
        validateTagScope(assignment.tagKey, assignment.scope),
    )
    .map((assignment) => ({
      key: assignment.tagKey,
      scope: assignment.scope,
      expiresAt: assignment.expiresAt,
    }));
  const existingPolicies = (user as AuthorizationContext).policies ?? [];

  return {
    ...user,
    roles: [...new Set(roles)],
    tags: deduplicateCurrentTags([...user.tags, ...storedTags], now),
    policies: [...existingPolicies, ...generatedPolicies],
  };
}
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return async (headers: AuthHeaders): Promise<AuthenticationResult> => {
    const credential = readCredential(headers, options.mode);
    if (!credential.ok) {
      return credential.missing
        ? { status: 401, code: 'missing_identity', message: 'Authentication is required' }
        : { status: 401, code: 'invalid_identity', message: 'Authentication is invalid' };
    }

    try {
      const identity = await options.authClient.introspect(credential.value);
      if (identity === null) {
        return { status: 401, code: 'invalid_identity', message: 'Authentication is invalid' };
      }
      return {
        status: 200,
        user: await hydratePlatformAccess(
          identity,
          options.store,
          (options.now ?? (() => new Date()))(),
        ),
      };
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError || error instanceof Error) {
        return {
          status: 503,
          code: 'identity_provider_unavailable',
          message: 'Identity provider is temporarily unavailable',
        };
      }
      return {
        status: 503,
        code: 'identity_provider_unavailable',
        message: 'Identity provider is temporarily unavailable',
      };
    }
  };
}
