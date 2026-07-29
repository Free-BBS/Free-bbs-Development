import type { PermissionRule, RolePermissionCatalog } from './policy.js';

const rules = (...entries: Array<readonly [string, string]>): PermissionRule[] =>
  entries.map(([action, resource]) => ({ action, resource }));

export const BASE_STUDENT_PERMISSIONS: readonly PermissionRule[] = [
  ...rules(
    ['dashboard.read', 'dashboard'],
    ['knowledge.read', 'knowledge_entry'],
    ['information.announcement.read', 'announcement'],
    ['information.consultation.create', 'consultation'],
    ['information.proposal.read', 'proposal'],
    ['information.proposal.create', 'proposal'],
    ['clubs.read', 'club'],
    ['clubs.join', 'club_membership'],
    ['clubs.leave', 'club_membership'],
    ['events.read', 'activity'],
    ['events.register', 'activity_registration'],
    ['events.cancel_registration', 'activity_registration'],
    ['sports.team.read', 'sports_team'],
  ),
  {
    action: 'liaison.resource.read',
    resource: 'liaison_resource',
    scope: { type: 'public', id: '*' },
  },
];
export const ROLE_PERMISSION_CATALOG: RolePermissionCatalog = {
  'platform.super_admin': rules(['*', '*']),
  'domain.arts_lead': rules(['clubs.*', '*'], ['events.*', '*'], ['knowledge.*', '*']),
  'domain.sports_lead': rules(['sports.*', '*'], ['events.*', '*'], ['knowledge.*', '*']),
  'domain.liaison_lead': rules(
    ['liaison.*', '*'],
    ['information.*', '*'],
    ['events.read', 'activity'],
    ['knowledge.*', '*'],
  ),
  'domain.rights_development_lead': rules(
    ['finance.*', '*'],
    ['information.consultation.*', 'consultation'],
    ['information.proposal.manage', 'proposal'],
    ['knowledge.*', '*'],
  ),
  'department.arts_director': rules(
    ['clubs.create', 'club'],
    ['clubs.update', 'club'],
    ['events.create', 'activity'],
    ['events.update', 'activity'],
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
  ),
  'department.sports_director': rules(
    ['sports.team.create', 'sports_team'],
    ['sports.team.update', 'sports_team'],
    ['sports.checkin.read', 'sports_checkin'],
    ['sports.checkin.create', 'sports_checkin'],
    ['events.create', 'activity'],
    ['events.update', 'activity'],
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
  ),
  'department.liaison_director': rules(
    ['liaison.resource.create', 'liaison_resource'],
    ['liaison.resource.update', 'liaison_resource'],
    ['information.announcement.create', 'announcement'],
    ['information.announcement.publish', 'announcement'],
    ['information.consultation.triage', 'consultation'],
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
  ),
  'department.rights_development_director': rules(
    ['finance.record.read', 'finance_record'],
    ['finance.record.create', 'finance_record'],
    ['finance.record.update', 'finance_record'],
    ['information.consultation.triage', 'consultation'],
    ['information.proposal.manage', 'proposal'],
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
  ),
  'department.arts_member': rules(
    ['clubs.create', 'club'],
    ['events.create', 'activity'],
    ['knowledge.create', 'knowledge_entry'],
  ),
  'department.sports_member': rules(
    ['sports.team.read', 'sports_team'],
    ['sports.checkin.read', 'sports_checkin'],
    ['events.create', 'activity'],
    ['knowledge.create', 'knowledge_entry'],
  ),
  'department.liaison_member': rules(
    ['liaison.resource.read', 'liaison_resource'],
    ['liaison.resource.create', 'liaison_resource'],
    ['information.announcement.create', 'announcement'],
    ['knowledge.create', 'knowledge_entry'],
  ),
  'department.rights_development_member': rules(
    ['information.consultation.read', 'consultation'],
    ['information.consultation.triage', 'consultation'],
    ['information.proposal.manage', 'proposal'],
    ['knowledge.create', 'knowledge_entry'],
  ),
  'affiliation.tuanwei_member': rules(
    ['knowledge.create', 'knowledge_entry'],
    ['events.create', 'activity'],
  ),
  'affiliation.sast_member': rules(
    ['knowledge.create', 'knowledge_entry'],
    ['events.create', 'activity'],
    ['events.technical_support', 'activity'],
    ['clubs.technical_support', 'club'],
  ),
  'affiliation.tuanwei_director': rules(
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
    ['events.create', 'activity'],
    ['events.update', 'activity'],
    ['information.announcement.publish', 'announcement'],
  ),
  'affiliation.tuanwei_lead': rules(
    ['knowledge.*', '*'],
    ['events.*', '*'],
    ['information.announcement.publish', 'announcement'],
    ['finance.*', '*'],
  ),
  'affiliation.sast_director': rules(
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
    ['events.create', 'activity'],
    ['events.update', 'activity'],
    ['events.technical_support', 'activity'],
    ['clubs.technical_support', 'club'],
  ),
  'affiliation.sast_lead': rules(
    ['knowledge.*', '*'],
    ['events.*', '*'],
    ['clubs.technical_support', 'club'],
  ),
  'affiliation.tms_member': rules(
    ['knowledge.create', 'knowledge_entry'],
    ['events.create', 'activity'],
  ),
  'affiliation.tms_director': rules(
    ['knowledge.create', 'knowledge_entry'],
    ['knowledge.publish', 'knowledge_entry'],
    ['events.create', 'activity'],
    ['events.update', 'activity'],
  ),
  'affiliation.tms_lead': rules(['knowledge.*', '*'], ['events.*', '*']),
};

export const SPORTS_CAPTAIN_RULES: readonly PermissionRule[] = rules(
  ['sports.checkin.read', 'sports_checkin'],
  ['sports.checkin.create', 'sports_checkin'],
);
export const ADMIN_PERMISSION_RULES: readonly PermissionRule[] = rules(
  ['admin.manage', 'admin'],
  ['admin.module.update', 'module'],
  ['admin.role_assignment.grant', 'role_assignment'],
  ['admin.role_assignment.revoke', 'role_assignment'],
  ['admin.tag_assignment.grant', 'tag_assignment'],
  ['admin.tag_assignment.revoke', 'tag_assignment'],
);
export const ALL_PERMISSION_RULES: readonly PermissionRule[] = [
  ...BASE_STUDENT_PERMISSIONS,
  ...Object.values(ROLE_PERMISSION_CATALOG).flat(),
  ...SPORTS_CAPTAIN_RULES,
  ...ADMIN_PERMISSION_RULES,
];
