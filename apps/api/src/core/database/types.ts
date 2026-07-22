import type { ModuleId, PermissionAction, RoleKey, ScopeRef } from '@freebbs-development/contracts';

export interface StoredRecord {
  id: string;
  status: string;
  ownerUid: string;
  scope: ScopeRef;
  createdAt: string;
  updatedAt: string;
}

export type NewRecord<T extends StoredRecord> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type RecordPatch<T extends StoredRecord> = Partial<NewRecord<T>>;

export interface ListFilters {
  status?: string;
  scopeType?: string;
  scopeId?: string;
  query?: string;
}

export interface RecordRepository<T extends StoredRecord> {
  create(input: NewRecord<T>): Promise<T>;
  get(id: string): Promise<T | null>;
  getForUpdate(id: string): Promise<T | null>;
  list(filters?: ListFilters): Promise<T[]>;
  update(id: string, patch: RecordPatch<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface SubjectRecord extends StoredRecord {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RoleRecord extends StoredRecord {
  key: RoleKey;
  name: string;
}

export interface PermissionRecord extends StoredRecord {
  action: PermissionAction;
  resource: string;
}

export interface RolePermissionRecord extends StoredRecord {
  roleKey: RoleKey;
  action: PermissionAction;
  resource: string;
  effect: 'allow' | 'deny';
}

export interface RoleAssignmentRecord extends StoredRecord {
  subjectUid: string;
  roleKey: RoleKey;
  expiresAt: string | null;
}

export interface TagDefinitionRecord extends StoredRecord {
  key: string;
  name: string;
  description: string;
  requiredScopeType: string | null;
  metadata: Record<string, unknown>;
}

export interface TagAssignmentRecord extends StoredRecord {
  subjectUid: string;
  tagKey: string;
  expiresAt: string | null;
}

export interface ModuleRecord extends StoredRecord {
  moduleId: ModuleId;
  name: string;
  description: string;
  enabled: boolean;
}

export interface ModuleOwnerRecord extends StoredRecord {
  moduleId: ModuleId;
  ownerType: 'role' | 'subject' | 'team';
  ownerId: string;
}

export interface AuditLogRecord extends StoredRecord {
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
}

export interface KnowledgeEntryRecord extends StoredRecord {
  type: 'workflow' | 'faq' | 'contact' | 'retrospective' | 'notice';
  title: string;
  body: string;
}

export interface AnnouncementRecord extends StoredRecord {
  title: string;
  body: string;
}

export interface ConsultationRecord extends StoredRecord {
  title: string;
  body: string;
  requesterUid: string;
}

export interface ClubRecord extends StoredRecord {
  name: string;
  description: string;
}

export interface ClubMembershipRecord extends StoredRecord {
  clubId: string;
  memberUid: string;
}

export interface ActivityRecord extends StoredRecord {
  title: string;
  description: string;
  clubId?: string | null;
  startsAt?: string | null;
}

export interface ActivityRegistrationRecord extends StoredRecord {
  activityId: string;
  participantUid: string;
}

export interface SportsTeamRecord extends StoredRecord {
  name: string;
  description: string;
}

export interface SportsCheckinRecord extends StoredRecord {
  teamId: string;
  memberUid: string;
  checkinDate: string;
}

export interface LiaisonResourceRecord extends StoredRecord {
  name: string;
  description: string;
  category: string;
  visibility: 'public' | 'organization' | 'restricted';
}

export interface FinanceRecord extends StoredRecord {
  title: string;
  kind: 'budget' | 'settlement';
  amountCents: number;
  activityId?: string | null;
}

export interface DevelopmentStore {
  transaction<T>(operation: (store: DevelopmentStore) => Promise<T>): Promise<T>;
  subjects: RecordRepository<SubjectRecord>;
  roles: RecordRepository<RoleRecord>;
  permissions: RecordRepository<PermissionRecord>;
  rolePermissions: RecordRepository<RolePermissionRecord>;
  roleAssignments: RecordRepository<RoleAssignmentRecord>;
  tagDefinitions: RecordRepository<TagDefinitionRecord>;
  tagAssignments: RecordRepository<TagAssignmentRecord>;
  modules: RecordRepository<ModuleRecord>;
  moduleOwners: RecordRepository<ModuleOwnerRecord>;
  auditLogs: RecordRepository<AuditLogRecord>;
  knowledge: RecordRepository<KnowledgeEntryRecord>;
  announcements: RecordRepository<AnnouncementRecord>;
  consultations: RecordRepository<ConsultationRecord>;
  clubs: RecordRepository<ClubRecord>;
  clubMemberships: RecordRepository<ClubMembershipRecord>;
  activities: RecordRepository<ActivityRecord>;
  activityRegistrations: RecordRepository<ActivityRegistrationRecord>;
  sportsTeams: RecordRepository<SportsTeamRecord>;
  sportsCheckins: RecordRepository<SportsCheckinRecord>;
  liaisonResources: RecordRepository<LiaisonResourceRecord>;
  financeRecords: RecordRepository<FinanceRecord>;
}
