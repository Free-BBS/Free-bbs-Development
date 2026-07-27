import { randomUUID } from 'node:crypto';

import { encodeDateOnly, encodeUtcDateTime } from './date-codec.js';
import {
  BUILT_IN_PERMISSIONS,
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_PERMISSIONS,
  BUILT_IN_TAG_PERMISSIONS,
} from '../bootstrap/built-in-definitions.js';
import { RecordConflictError } from './record-conflict-error.js';

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
  Page,
  PageRequest,
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
  TagPermissionRecord,
} from './types.js';

interface MemoryState {
  subjects: SubjectRecord[];
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  rolePermissions: RolePermissionRecord[];
  roleAssignments: RoleAssignmentRecord[];
  tagDefinitions: TagDefinitionRecord[];
  tagAssignments: TagAssignmentRecord[];
  tagPermissions: TagPermissionRecord[];
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
interface StateHolder {
  current: MemoryState;
  transactionTail: Promise<void>;
}
async function withWriteLock<T>(holder: StateHolder, operation: () => Promise<T>): Promise<T> {
  const previous = holder.transactionTail;
  let release: () => void = () => {};
  holder.transactionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

const searchFields: Record<CollectionName, string[]> = {
  subjects: ['uid', 'displayName'],
  roles: ['key', 'name'],
  permissions: ['action', 'resource'],
  rolePermissions: ['roleKey', 'action', 'resource'],
  roleAssignments: ['subjectUid', 'roleKey'],
  tagDefinitions: ['key', 'name', 'description'],
  tagAssignments: ['subjectUid', 'tagKey'],
  tagPermissions: ['tagKey', 'action', 'resource'],
  modules: ['moduleId', 'name', 'description'],
  moduleOwners: ['moduleId', 'ownerType', 'ownerId'],
  auditLogs: ['actorUid', 'action', 'resourceType', 'resourceId'],
  knowledge: ['title', 'body'],
  announcements: ['title', 'body'],
  consultations: ['title', 'body', 'requesterUid'],
  clubs: ['name', 'description'],
  clubMemberships: ['clubId', 'memberUid'],
  activities: ['title', 'description'],
  activityRegistrations: ['activityId', 'participantUid'],
  sportsTeams: ['name', 'description'],
  sportsCheckins: ['teamId', 'memberUid'],
  liaisonResources: ['name', 'description', 'category'],
  financeRecords: ['title', 'kind'],
};

function normalizedValues<T extends object>(value: T): T {
  const result = structuredClone(value) as Record<string, unknown>;
  for (const key of ['expiresAt', 'startsAt']) {
    if (!Object.hasOwn(result, key) || result[key] === null || result[key] === undefined) continue;
    const encoded = encodeUtcDateTime(result[key] as string);
    result[key] = encoded?.toISOString() ?? null;
  }
  if (typeof result.checkinDate === 'string')
    result.checkinDate = encodeDateOnly(result.checkinDate);
  if (
    typeof result.amountCents === 'number' &&
    (!Number.isSafeInteger(result.amountCents) || result.amountCents < 0)
  ) {
    throw new TypeError('amountCents must be a non-negative safe integer');
  }
  return result as T;
}
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
    tagPermissions: [],
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
  state.roles = BUILT_IN_ROLES.map((definition, index) =>
    stored<RoleRecord>(`role-governance-${index}`, {
      ...definition,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  );
  state.permissions = BUILT_IN_PERMISSIONS.map((definition, index) =>
    stored<PermissionRecord>(`permission-governance-${index}`, {
      ...definition,
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
  );
  state.rolePermissions = BUILT_IN_ROLE_PERMISSIONS.map((definition, index) =>
    stored<RolePermissionRecord>(`role-permission-governance-${index}`, {
      ...definition,
      status: 'active',
      ownerUid: 'demo-admin',
    }),
  );
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
      scope: publicScope,
    }),
  ];
  state.tagDefinitions = [
    stored('tag-captain-definition', {
      key: 'sports.team_captain',
      requiredScopeType: 'sports_team',
      metadata: { resourceTypes: ['sports_team'] },
      name: '体育代表队队长',
      description: '仅在绑定代表队内生效。',
      status: 'active',
      ownerUid: 'demo-admin',
      scope: publicScope,
    }),
    stored('tag-extension-definition', {
      key: 'extension.custom',
      requiredScopeType: null,
      metadata: { resourceTypes: [] },
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
  state.tagPermissions = BUILT_IN_TAG_PERMISSIONS.map((definition, index) =>
    stored<TagPermissionRecord>(`tag-permission-governance-${index}`, {
      ...definition,
      status: 'active',
      ownerUid: 'demo-admin',
    }),
  );

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
    private readonly allowRowLock: boolean,
  ) {}

  async create(input: NewRecord<T>): Promise<T> {
    return withWriteLock(this.holder, async () => {
      const conflictMessage = this.conflictMessage(input);
      if (conflictMessage !== undefined) throw new RecordConflictError(conflictMessage);
      const now = new Date().toISOString();
      const record = {
        ...normalizedValues(input),
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      } as T;
      this.records().push(record);
      return structuredClone(record);
    });
  }

  async get(id: string): Promise<T | null> {
    const record = this.records().find((candidate) => candidate.id === id);
    return record ? structuredClone(record) : null;
  }

  async getForUpdate(id: string): Promise<T | null> {
    if (!this.allowRowLock) throw new Error('Row locking requires a store transaction');
    return this.get(id);
  }

  async list(filters: ListFilters = {}): Promise<T[]> {
    const query = filters.query?.trim().toLocaleLowerCase();
    return this.records()
      .filter((record) => !filters.status || record.status === filters.status)
      .filter((record) => !filters.scopeType || record.scope.type === filters.scopeType)
      .filter((record) => !filters.scopeId || record.scope.id === filters.scopeId)
      .filter((record) => {
        if (!query) return true;
        const searchable = record as unknown as Record<string, unknown>;
        return searchFields[this.collection]
          .map((key) => String(searchable[key] ?? ''))
          .join(' ')
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      )
      .map((record) => structuredClone(record));
  }

  async page(filters: ListFilters | undefined, request: PageRequest): Promise<Page<T>> {
    validatePageRequest(request);
    const records = await this.list(filters);
    const offset = (request.page - 1) * request.pageSize;
    return {
      items: records.slice(offset, offset + request.pageSize),
      page: request.page,
      pageSize: request.pageSize,
      total: records.length,
    };
  }

  async update(id: string, patch: RecordPatch<T>): Promise<T | null> {
    return withWriteLock(this.holder, async () => {
      const records = this.records();
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) return null;
      const existing = records[index];
      if (!existing) return null;
      const normalizedPatch = normalizedValues(patch);
      const conflictMessage = this.conflictMessage(
        { ...existing, ...normalizedPatch } as NewRecord<T>,
        existing.id,
      );
      if (conflictMessage !== undefined) throw new RecordConflictError(conflictMessage);
      const updated = {
        ...existing,
        ...normalizedPatch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      } as T;
      records[index] = updated;
      return structuredClone(updated);
    });
  }

  async delete(id: string): Promise<boolean> {
    return withWriteLock(this.holder, async () => {
      const records = this.records();
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) return false;
      records.splice(index, 1);
      return true;
    });
  }

  private hasAssignmentConflict(input: NewRecord<T>, excludeId?: string): boolean {
    const candidate = input as unknown as {
      subjectUid: string;
      roleKey?: string;
      tagKey?: string;
      scope: { type: string; id: string };
    };
    const assignmentKey = this.collection === 'roleAssignments' ? 'roleKey' : 'tagKey';
    return this.records().some((record) => {
      if (record.id === excludeId) return false;
      const existing = record as unknown as typeof candidate;
      return (
        existing.subjectUid === candidate.subjectUid &&
        existing[assignmentKey] === candidate[assignmentKey] &&
        existing.scope.type === candidate.scope.type &&
        existing.scope.id === candidate.scope.id
      );
    });
  }

  private conflictMessage(input: NewRecord<T>, excludeId?: string): string | undefined {
    if (
      (this.collection === 'roleAssignments' || this.collection === 'tagAssignments') &&
      this.hasAssignmentConflict(input, excludeId)
    ) {
      return 'Assignment already exists';
    }
    if (this.collection === 'tagPermissions') {
      const candidate = input as unknown as {
        tagKey: string;
        action: string;
        resource: string;
        scope: { type: string; id: string };
      };
      if (
        this.records().some((record) => {
          if (record.id === excludeId) return false;
          const current = record as unknown as typeof candidate;
          return (
            current.tagKey === candidate.tagKey &&
            current.action === candidate.action &&
            current.resource === candidate.resource &&
            current.scope.type === candidate.scope.type &&
            current.scope.id === candidate.scope.id
          );
        })
      ) {
        return 'Tag permission already exists';
      }
    }
    if (this.collection === 'clubMemberships') {
      const candidate = input as unknown as { clubId: string; memberUid: string };
      if (
        this.records().some((record) => {
          if (record.id === excludeId) return false;
          const current = record as unknown as typeof candidate;
          return current.clubId === candidate.clubId && current.memberUid === candidate.memberUid;
        })
      ) {
        return 'Membership already exists';
      }
    }
    if (this.collection === 'activityRegistrations') {
      const candidate = input as unknown as { activityId: string; participantUid: string };
      if (
        this.records().some((record) => {
          if (record.id === excludeId) return false;
          const current = record as unknown as typeof candidate;
          return (
            current.activityId === candidate.activityId &&
            current.participantUid === candidate.participantUid
          );
        })
      ) {
        return 'Registration already exists';
      }
    }
    if (this.collection === 'sportsCheckins') {
      const candidate = input as unknown as {
        teamId: string;
        memberUid: string;
        checkinDate: string;
      };
      if (
        this.records().some((record) => {
          if (record.id === excludeId) return false;
          const current = record as unknown as typeof candidate;
          return (
            current.teamId === candidate.teamId &&
            current.memberUid === candidate.memberUid &&
            current.checkinDate === candidate.checkinDate
          );
        })
      ) {
        return 'Check-in already exists';
      }
    }
    return undefined;
  }

  private records(): T[] {
    return this.holder.current[this.collection] as unknown as T[];
  }
}

function buildStore(holder: StateHolder, inTransaction = false): DevelopmentStore {
  const repository = <T extends StoredRecord>(collection: CollectionName) =>
    new MemoryRepository<T>(holder, collection, inTransaction);
  const store: DevelopmentStore = {
    async transaction<T>(operation: (transactionStore: DevelopmentStore) => Promise<T>) {
      return withWriteLock(holder, async () => {
        const transactionHolder: StateHolder = {
          current: structuredClone(holder.current),
          transactionTail: Promise.resolve(),
        };
        const result = await operation(buildStore(transactionHolder, true));
        holder.current = structuredClone(transactionHolder.current);
        return result;
      });
    },
    subjects: repository('subjects'),
    roles: repository('roles'),
    permissions: repository('permissions'),
    rolePermissions: repository('rolePermissions'),
    roleAssignments: repository('roleAssignments'),
    tagDefinitions: repository('tagDefinitions'),
    tagAssignments: repository('tagAssignments'),
    tagPermissions: repository('tagPermissions'),
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

function validatePageRequest(request: PageRequest): void {
  if (!Number.isInteger(request.page) || request.page < 1) {
    throw new RangeError('page must be an integer greater than or equal to 1');
  }
  if (!Number.isInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 100) {
    throw new RangeError('pageSize must be an integer between 1 and 100');
  }
}

export interface MemoryStoreOptions {
  seed?: boolean;
}

export function createMemoryStore(options: MemoryStoreOptions = {}): DevelopmentStore {
  return buildStore({
    current: options.seed === false ? createEmptyState() : createDemoState(),
    transactionTail: Promise.resolve(),
  });
}
