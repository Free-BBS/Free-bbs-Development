import {
  MODULE_IDS,
  ROLE_KEYS,
  type ModuleId,
  type PermissionAction,
  type RoleKey,
  type ScopeRef,
} from '@freebbs-development/contracts';
import {
  ALL_PERMISSION_RULES,
  ROLE_PERMISSION_CATALOG,
  SPORTS_CAPTAIN_RULES,
} from '../authorization/permission-catalog.js';

const publicScope: ScopeRef = { type: 'public', id: '*' };
const sportsTeamScope: ScopeRef = { type: 'sports_team', id: '*' };

const roleNames: Readonly<Record<RoleKey, string>> = {
  'platform.super_admin': 'Platform super administrator',
  'domain.arts_lead': 'Arts domain lead',
  'domain.sports_lead': 'Sports domain lead',
  'domain.liaison_lead': 'Liaison domain lead',
  'domain.rights_development_lead': 'Rights and development domain lead',
  'department.arts_director': 'Arts department director',
  'department.sports_director': 'Sports department director',
  'department.liaison_director': 'Liaison department director',
  'department.rights_development_director': 'Rights and development department director',
  'department.arts_member': 'Arts department member',
  'department.sports_member': 'Sports department member',
  'department.liaison_member': 'Liaison department member',
  'department.rights_development_member': 'Rights and development department member',
  'affiliation.tuanwei_member': 'Youth League affiliation member',
  'affiliation.sast_member': 'SAST affiliation member',
};

const moduleNames: Readonly<Record<ModuleId, string>> = {
  dashboard: 'Dashboard',
  knowledge: 'Knowledge',
  information: 'Information and consultation',
  clubs: 'Clubs',
  events: 'Events',
  liaison: 'Liaison resources',
  sports: 'Sports teams',
  finance: 'Finance governance',
  admin: 'Permissions and modules',
};

export const BUILT_IN_ROLES = ROLE_KEYS.map((key) => ({ key, name: roleNames[key] }));

const seenPermissions = new Set<string>();
export const BUILT_IN_PERMISSIONS = ALL_PERMISSION_RULES.flatMap(({ action, resource }) => {
  const identity = `${action}\u0000${resource}`;
  if (seenPermissions.has(identity)) return [];
  seenPermissions.add(identity);
  return [{ action: action as PermissionAction, resource }];
});

export const BUILT_IN_ROLE_PERMISSIONS = ROLE_KEYS.flatMap((roleKey) =>
  ROLE_PERMISSION_CATALOG[roleKey].map(({ action, resource, scope }) => ({
    roleKey,
    action: action as PermissionAction,
    resource,
    effect: 'allow' as const,
    scope: scope ?? publicScope,
  })),
);

export const BUILT_IN_TAG_DEFINITIONS = [
  {
    key: 'sports.team_captain',
    name: 'Sports team captain',
    description: 'Grants check-in permissions only within one assigned sports team.',
    requiredScopeType: 'sports_team',
    metadata: { resourceTypes: ['sports_team'] },
  },
] as const;

export const BUILT_IN_TAG_PERMISSIONS = SPORTS_CAPTAIN_RULES.map(({ action, resource }) => ({
  tagKey: 'sports.team_captain',
  action: action as PermissionAction,
  resource,
  effect: 'allow' as const,
  scope: sportsTeamScope,
}));

export const BUILT_IN_MODULES = MODULE_IDS.map((moduleId) => ({
  moduleId,
  name: moduleNames[moduleId],
  description: `${moduleNames[moduleId]} module`,
  enabled: true,
}));
