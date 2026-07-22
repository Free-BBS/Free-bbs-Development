import type { PermissionAction } from './permissions.js';

export const MODULE_IDS = [
  'dashboard',
  'knowledge',
  'information',
  'clubs',
  'events',
  'liaison',
  'sports',
  'finance',
  'admin',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const ROLE_KEYS = [
  'platform.super_admin',
  'domain.arts_lead',
  'domain.sports_lead',
  'domain.liaison_lead',
  'domain.rights_development_lead',
  'department.arts_director',
  'department.sports_director',
  'department.liaison_director',
  'department.rights_development_director',
  'department.arts_member',
  'department.sports_member',
  'department.liaison_member',
  'department.rights_development_member',
  'affiliation.tuanwei_member',
  'affiliation.sast_member',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export type ModuleStatus = 'enabled' | 'disabled';

export interface ModuleManifest {
  id: ModuleId;
  name: string;
  description: string;
  route: string;
  icon: string;
  ownerTeam: string;
  status: ModuleStatus;
  requiredPermissions: PermissionAction[];
  order: number;
}
