import { randomUUID } from 'node:crypto';

import type {
  ActivityRecord,
  ActivityRegistrationRecord,
  AnnouncementRecord,
  AuditLogRecord,
  ClubMembershipRecord,
  ClubRecord,
  ConsultationRecord,
  DevelopmentStore,
  FinanceRecord,
  KnowledgeEntryRecord,
  LiaisonResourceRecord,
  ListFilters,
  ModuleOwnerRecord,
  ModuleRecord,
  NewRecord,
  PermissionRecord,
  RecordPatch,
  RecordRepository,
  RoleAssignmentRecord,
  RolePermissionRecord,
  RoleRecord,
  SportsCheckinRecord,
  SportsTeamRecord,
  StoredRecord,
  SubjectRecord,
  TagAssignmentRecord,
  TagDefinitionRecord,
} from './types.js';

interface MemoryState {
  subjects: SubjectRecord[];
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  rolePermissions: RolePermissionRecord[];
  roleAssignments: RoleAssignmentRecord[];
  tagDefinitions: TagDefinitionRecord[];
  tagAssignments: TagAssignmentRecord[];
  modules: ModuleRecord[];
  moduleOwners: ModuleOwnerRecord[];
  auditLogs: AuditLogRecord[];
  knowledge: KnowledgeEntryRecord[];
  announcements: AnnouncementRecord[];
  consultations: ConsultationRecord[];
  clubs: ClubRecord[];
  clubMemberships: ClubMembershipRecord[];
  activities: ActivityRecord[];
  activityRegistrations: ActivityRegistrationRecord[];
  sportsTeams: SportsTeamRecord[];
  sportsCheckins: SportsCheckinRecord[];
  liaisonResources: LiaisonResourceRecord[];
  financeRecords: FinanceRecord[];
}

type CollectionName = keyof MemoryState;
type StateHolder = { current: MemoryState };

const publicScope = { type: 'public', id: '*' } as const;
const seedTime = '2026-07-22T00:00:00.000Z';

function stored<T extends StoredRecord>(
  id: string,
  input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
): T {
  return { id, createdAt: seedTime, updatedAt: seedTime, ...input } as T;
}

function createEmptyState(): MemoryState {
  return {
    subjects: [],
    roles: [],
    permissions: [],
    rolePermissions: [],
    roleAssignments: [],
    tagDefinitions: [],
    tagAssignments: [],
    modules: [],
    moduleOwners: [],
    auditLogs: [],
    knowledge: [],
    announcements: [],
    consultations: [],
    clubs: [],
    clubMemberships: [],
    activities: [],
    activityRegistrations: [],
    sportsTeams: [],
    sportsCheckins: [],
    liaisonResources: [],
    financeRecords: [],
  };
}

function createDemoState(): MemoryState {
  const state = createEmptyState();
  state.subjects = [
    stored('subject-admin', {
      uid: 'demo-admin',
      displayName: '发展端管理员',
      avatarUrl: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('subject-student', {
      uid: 'demo-student',
      displayName: '普通同学',
      avatarUrl: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('subject-sports', {
      uid: 'demo-sports-lead',
      displayName: '体育负责人',
      avatarUrl: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('subject-captain', {
      uid: 'demo-captain',
      displayName: '篮球队队长',
      avatarUrl: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  ];
  state.roles = [
    stored('role-admin', {
      key: 'platform.super_admin',
      name: '最高权限',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('role-sports-lead', {
      key: 'domain.sports_lead',
      name: '体育负责人',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  ];
  state.roleAssignments = [
    stored('assignment-admin', {
      subjectUid: 'demo-admin',
      roleKey: 'platform.super_admin',
      expiresAt: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('assignment-sports-lead', {
      subjectUid: 'demo-sports-lead',
      roleKey: 'domain.sports_lead',
      expiresAt: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: { type: 'department', id: 'sports' },
    }),
  ];
  state.tagDefinitions = [
    stored('tag-captain-definition', {
      key: 'sports.team_captain',
      name: '体育代表队队长',
      description: '仅在绑定代表队内生效。',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('tag-extension-definition', {
      key: 'extension.custom',
      name: '扩展权限标签',
      description: '为后续模块保留的标签接口。',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  ];
  state.tagAssignments = [
    stored('tag-captain-a', {
      subjectUid: 'demo-captain',
      tagKey: 'sports.team_captain',
      expiresAt: null,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: { type: 'sports_team', id: 'team-basketball' },
    }),
  ];

  const moduleNames: Array<[ModuleRecord['moduleId'], string]> = [
    ['dashboard', '工作台'],
    ['knowledge', '经验库'],
    ['information', '信息与咨询'],
    ['clubs', '社群与俱乐部'],
    ['events', '活动'],
    ['liaison', '联络资源'],
    ['sports', '体育代表队'],
    ['finance', '财务治理'],
    ['admin', '权限与模块管理'],
  ];
  state.modules = moduleNames.map(([moduleId, name]) =>
    stored(`module-${moduleId}`, {
      moduleId,
      name,
      description: `${name}模块`,
      enabled: true,
      status: 'enabled',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  );

  state.knowledge = [
    stored('knowledge-workflow', {
      type: 'workflow',
      title: '活动立项与复盘流程',
      body: '从立项、审批到复盘的标准步骤。',
      status: 'published',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('knowledge-faq', {
      type: 'faq',
      title: '部门交接常见问题',
      body: '集中说明账号、资料和联系人交接。',
      status: 'published',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  ];
  state.announcements = [
    stored('announcement-club', {
      title: '秋季俱乐部招新开放',
      body: '欢迎同学浏览并加入感兴趣的俱乐部。',
      status: 'published',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('announcement-consultation', {
      title: '权益咨询窗口更新时间',
      body: '工作日咨询将在两个工作日内完成分流。',
      status: 'published',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  ];
  state.consultations = [
    stored('consultation-venue', {
      title: '活动场地申请',
      body: '请问教学楼公共空间如何申请？',
      requesterUid: 'demo-student',
      status: 'triaged',
      ownerUid: 'demo-student',
      scope: publicScope,
    }),
    stored('consultation-rights', {
      title: '校园权益建议',
      body: '希望延长公共讨论空间开放时间。',
      requesterUid: 'demo-student',
      status: 'processing',
      ownerUid: 'demo-student',
      scope: publicScope,
    }),
  ];
  state.clubs = [
    stored('club-music', {
      name: '校园音乐俱乐部',
      description: '排练、分享与小型演出。',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('club-running', {
      name: '自由跑团',
      description: '每周轻松跑与训练交流。',
      status: 'active',
      ownerUid: 'demo-sports-lead',
      scope: publicScope,
    }),
  ];
  state.clubMemberships = [
    stored('membership-music', {
      clubId: 'club-music',
      memberUid: 'demo-student',
      status: 'active',
      ownerUid: 'demo-student',
      scope: { type: 'club', id: 'club-music' },
    }),
    stored('membership-running', {
      clubId: 'club-running',
      memberUid: 'demo-captain',
      status: 'active',
      ownerUid: 'demo-captain',
      scope: { type: 'club', id: 'club-running' },
    }),
  ];
  state.activities = [
    stored('activity-orientation', {
      title: '新生社群见面会',
      description: '一次认识各俱乐部的开放活动。',
      clubId: null,
      startsAt: '2026-09-05T10:00:00.000Z',
      status: 'open',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('activity-night-run', {
      title: '校园夜跑',
      description: '五公里轻松跑。',
      clubId: 'club-running',
      startsAt: '2026-09-12T19:00:00.000Z',
      status: 'open',
      ownerUid: 'demo-sports-lead',
      scope: publicScope,
    }),
  ];
  state.activityRegistrations = [
    stored('registration-orientation', {
      activityId: 'activity-orientation',
      participantUid: 'demo-student',
      status: 'registered',
      ownerUid: 'demo-student',
      scope: { type: 'activity', id: 'activity-orientation' },
    }),
    stored('registration-night-run', {
      activityId: 'activity-night-run',
      participantUid: 'demo-captain',
      status: 'registered',
      ownerUid: 'demo-captain',
      scope: { type: 'activity', id: 'activity-night-run' },
    }),
  ];
  state.sportsTeams = [
    stored('team-basketball', {
      name: '院篮球队',
      description: '学院篮球代表队。',
      status: 'active',
      ownerUid: 'demo-sports-lead',
      scope: { type: 'sports_team', id: 'team-basketball' },
    }),
    stored('team-badminton', {
      name: '院羽毛球队',
      description: '学院羽毛球代表队。',
      status: 'active',
      ownerUid: 'demo-sports-lead',
      scope: { type: 'sports_team', id: 'team-badminton' },
    }),
  ];
  state.sportsCheckins = [
    stored('checkin-basketball-1', {
      teamId: 'team-basketball',
      memberUid: 'demo-captain',
      checkinDate: '2026-07-21',
      status: 'present',
      ownerUid: 'demo-captain',
      scope: { type: 'sports_team', id: 'team-basketball' },
    }),
    stored('checkin-basketball-2', {
      teamId: 'team-basketball',
      memberUid: 'demo-student',
      checkinDate: '2026-07-21',
      status: 'present',
      ownerUid: 'demo-captain',
      scope: { type: 'sports_team', id: 'team-basketball' },
    }),
  ];
  state.liaisonResources = [
    stored('liaison-tuanwei', {
      name: '校团委活动联络窗口',
      description: '大型活动审批与资源协调。',
      category: 'contact',
      visibility: 'public',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('liaison-venue', {
      name: '公共场地预约说明',
      description: '常用场地管理部门和预约入口。',
      category: 'venue',
      visibility: 'organization',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: { type: 'organization', id: 'freebbs' },
    }),
  ];
  state.financeRecords = [
    stored('finance-orientation-budget', {
      title: '新生见面会预算',
      kind: 'budget',
      amountCents: 150000,
      activityId: 'activity-orientation',
      status: 'approved',
      ownerUid: 'demo-admin',
      scope: { type: 'activity', id: 'activity-orientation' },
    }),
    stored('finance-night-run-settlement', {
      title: '校园夜跑物资结算',
      kind: 'settlement',
      amountCents: 48600,
      activityId: 'activity-night-run',
      status: 'submitted',
      ownerUid: 'demo-sports-lead',
      scope: { type: 'activity', id: 'activity-night-run' },
    }),
  ];
  return state;
}

class MemoryRepository<T extends StoredRecord> implements RecordRepository<T> {
  constructor(
    private readonly holder: StateHolder,
    private readonly collection: CollectionName,
  ) {}

  async create(input: NewRecord<T>): Promise<T> {
    const now = new Date().toISOString();
    const record = {
      ...structuredClone(input),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as T;
    this.records().push(record);
    return structuredClone(record);
  }

  async get(id: string): Promise<T | null> {
    const record = this.records().find((candidate) => candidate.id === id);
    return record ? structuredClone(record) : null;
  }

  async list(filters: ListFilters = {}): Promise<T[]> {
    const query = filters.query?.trim().toLocaleLowerCase();
    return this.records()
      .filter((record) => !filters.status || record.status === filters.status)
      .filter((record) => !filters.scopeType || record.scope.type === filters.scopeType)
      .filter((record) => !filters.scopeId || record.scope.id === filters.scopeId)
      .filter((record) => !query || JSON.stringify(record).toLocaleLowerCase().includes(query))
      .map((record) => structuredClone(record));
  }

  async update(id: string, patch: RecordPatch<T>): Promise<T | null> {
    const records = this.records();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) return null;
    const existing = records[index];
    if (!existing) return null;
    const updated = {
      ...existing,
      ...structuredClone(patch),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    } as T;
    records[index] = updated;
    return structuredClone(updated);
  }

  async delete(id: string): Promise<boolean> {
    const records = this.records();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) return false;
    records.splice(index, 1);
    return true;
  }

  private records(): T[] {
    return this.holder.current[this.collection] as unknown as T[];
  }
}

function buildStore(holder: StateHolder): DevelopmentStore {
  const repository = <T extends StoredRecord>(collection: CollectionName) =>
    new MemoryRepository<T>(holder, collection);
  const store: DevelopmentStore = {
    async transaction<T>(operation: (transactionStore: DevelopmentStore) => Promise<T>) {
      const transactionHolder = { current: structuredClone(holder.current) };
      const result = await operation(buildStore(transactionHolder));
      holder.current = transactionHolder.current;
      return result;
    },
    subjects: repository('subjects'),
    roles: repository('roles'),
    permissions: repository('permissions'),
    rolePermissions: repository('rolePermissions'),
    roleAssignments: repository('roleAssignments'),
    tagDefinitions: repository('tagDefinitions'),
    tagAssignments: repository('tagAssignments'),
    modules: repository('modules'),
    moduleOwners: repository('moduleOwners'),
    auditLogs: repository('auditLogs'),
    knowledge: repository('knowledge'),
    announcements: repository('announcements'),
    consultations: repository('consultations'),
    clubs: repository('clubs'),
    clubMemberships: repository('clubMemberships'),
    activities: repository('activities'),
    activityRegistrations: repository('activityRegistrations'),
    sportsTeams: repository('sportsTeams'),
    sportsCheckins: repository('sportsCheckins'),
    liaisonResources: repository('liaisonResources'),
    financeRecords: repository('financeRecords'),
  };
  return store;
}

export interface MemoryStoreOptions {
  seed?: boolean;
}

export function createMemoryStore(options: MemoryStoreOptions = {}): DevelopmentStore {
  return buildStore({ current: options.seed === false ? createEmptyState() : createDemoState() });
}
