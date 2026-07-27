export type PermissionAction = '*' | `${string}.${string}`;

export interface ScopeRef {
  type: string;
  id: string;
}

export interface PermissionTag {
  key: string;
  scope?: ScopeRef;
  expiresAt?: string | null;
}

export function validateTagScope(tag: string, scope: ScopeRef | undefined): boolean {
  if (tag !== 'sports.team_captain') {
    return true;
  }

  return scope?.type === 'sports_team' && scope.id.length > 0 && scope.id !== '*';
}
