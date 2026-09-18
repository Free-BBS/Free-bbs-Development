import { IdentityProviderUnavailableError } from './auth-client.js';

import type { UserContext } from '@freebbs-development/contracts';
import { loadAuthorizationContext } from '../authorization/load-authorization-context.js';
import type { AuthorizationContext } from '../authorization/policy.js';
import type { DevelopmentStore, SubjectRecord } from '../database/types.js';
import type { AuthClient } from './auth-client.js';

export type AuthHeaders = Readonly<Record<string, string | string[] | undefined>>;

export type AuthenticationResult =
  | { status: 200; user: AuthorizationContext }
  | {
      status: 401 | 403 | 503;
      code:
        | 'missing_identity'
        | 'invalid_identity'
        | 'preview_access_denied'
        | 'identity_provider_unavailable';
      message: string;
    };

export interface AuthMiddlewareOptions {
  authClient: AuthClient;
  mode: 'main' | 'demo';
  store?: DevelopmentStore;
  allowedUids?: readonly string[];
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

export async function synchronizeSubject(
  store: DevelopmentStore,
  identity: UserContext,
  now: Date,
): Promise<SubjectRecord> {
  void now;
  const existing = (await store.subjects.list({ query: identity.uid })).find(
    ({ uid }) => uid === identity.uid,
  );
  if (existing === undefined) {
    return store.subjects.create({
      uid: identity.uid,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      status: 'active',
      ownerUid: identity.uid,
      scope: { type: 'public', id: '*' },
    });
  }
  const activatePending = existing.status === 'pending';
  if (
    existing.displayName === identity.displayName &&
    existing.avatarUrl === identity.avatarUrl &&
    !activatePending
  ) {
    return existing;
  }
  const updated = await store.subjects.update(existing.id, {
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    ...(activatePending ? { status: 'active' as const } : {}),
  });
  if (updated === null) throw new Error('Subject disappeared during synchronization');
  return updated;
}

function emptyAuthorizationContext(identity: UserContext): AuthorizationContext {
  return { ...identity, roles: [], tags: [], policies: [] };
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const allowedUids = options.allowedUids && new Set(options.allowedUids);
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
      if (options.mode === 'main' && allowedUids && !allowedUids.has(identity.uid)) {
        return {
          status: 403,
          code: 'preview_access_denied',
          message: 'Development preview is not available for this account',
        };
      }
      const now = (options.now ?? (() => new Date()))();
      if (options.store === undefined) {
        return { status: 200, user: emptyAuthorizationContext(identity) };
      }
      if (options.mode === 'main') {
        await synchronizeSubject(options.store, identity, now);
      }
      return {
        status: 200,
        user: await loadAuthorizationContext(options.store, identity, now),
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
