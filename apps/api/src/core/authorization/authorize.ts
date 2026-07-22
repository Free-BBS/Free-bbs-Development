import {
  BASE_STUDENT_PERMISSIONS,
  ROLE_PERMISSION_CATALOG,
  SPORTS_CAPTAIN_RULES,
} from './permission-catalog.js';

import { validateTagScope } from '@freebbs-development/contracts';
import type { PermissionTag, ScopeRef } from '@freebbs-development/contracts';
import type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationPolicy,
  AuthorizationRequest,
  PermissionRule,
} from './policy.js';

function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === '*' || pattern === value) return true;
  return pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1));
}

function matchesRule(rule: PermissionRule, request: AuthorizationRequest): boolean {
  return (
    matchesPattern(rule.action, request.action) && matchesPattern(rule.resource, request.resource)
  );
}

function matchesScope(grant: ScopeRef | undefined, requested: ScopeRef | undefined): boolean {
  if (grant === undefined) return true;
  return requested !== undefined && grant.type === requested.type && grant.id === requested.id;
}

function isExpired(expiresAt: string | null | undefined, now: Date): boolean {
  if (expiresAt === undefined || expiresAt === null) return false;
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

function deny(
  reason: AuthorizationDecision['reason'],
  matchedBy: string | null,
): AuthorizationDecision {
  return { allowed: false, reason, matchedBy };
}

function allow(reason: AuthorizationDecision['reason'], matchedBy: string): AuthorizationDecision {
  return { allowed: true, reason, matchedBy };
}

function policySource(policy: AuthorizationPolicy): string {
  return `policy:${policy.id}`;
}

function tagSource(tag: PermissionTag): string {
  const scope = tag.scope;
  return scope === undefined ? `tag:${tag.key}` : `tag:${tag.key}:${scope.type}:${scope.id}`;
}

export function authorize(
  context: AuthorizationContext,
  request: AuthorizationRequest,
  now = new Date(),
): AuthorizationDecision {
  const matchingPolicies = (context.policies ?? []).filter((policy) =>
    matchesRule(policy, request),
  );

  const explicitDeny = matchingPolicies.find(
    (policy) => policy.effect === 'deny' && matchesScope(policy.scope, request.scope),
  );
  if (explicitDeny !== undefined) return deny('explicit-deny', policySource(explicitDeny));

  const expiredPolicy = matchingPolicies.find(
    (policy) => isExpired(policy.expiresAt, now) && matchesScope(policy.scope, request.scope),
  );
  if (expiredPolicy !== undefined) {
    return deny('expired-assignment', policySource(expiredPolicy));
  }

  const policyGrant = matchingPolicies.find(
    (policy) => policy.effect === 'allow' && matchesScope(policy.scope, request.scope),
  );
  if (policyGrant !== undefined) return allow('policy-grant', policySource(policyGrant));

  let scopeMismatch: string | null = null;
  const mismatchedPolicy = matchingPolicies.find(
    (policy) => policy.effect === 'allow' && !matchesScope(policy.scope, request.scope),
  );
  if (mismatchedPolicy !== undefined) scopeMismatch = policySource(mismatchedPolicy);

  for (const tag of context.tags) {
    if (tag.key !== 'sports.team_captain') continue;
    if (!validateTagScope(tag.key, tag.scope)) continue;
    if (!SPORTS_CAPTAIN_RULES.some((rule) => matchesRule(rule, request))) continue;
    const source = tagSource(tag);
    if (!matchesScope(tag.scope, request.scope)) {
      scopeMismatch ??= source;
      continue;
    }
    if (isExpired(tag.expiresAt, now)) return deny('expired-assignment', source);
    return allow('tag-grant', source);
  }

  for (const role of context.roles) {
    if (ROLE_PERMISSION_CATALOG[role]?.some((rule) => matchesRule(rule, request))) {
      return allow('role-grant', `role:${role}`);
    }
  }

  if (BASE_STUDENT_PERMISSIONS.some((rule) => matchesRule(rule, request))) {
    return allow('base-role-grant', 'base-role:student');
  }

  if (scopeMismatch !== null) return deny('scope-mismatch', scopeMismatch);
  return deny('no-matching-grant', null);
}
