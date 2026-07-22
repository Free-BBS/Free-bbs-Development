import { randomUUID } from 'node:crypto';

import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';

import { loadMySqlConfig, type MySqlConfig } from './migrate.js';
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

type Executor = Pool | PoolConnection;
type RecordInput<T extends StoredRecord> = NewRecord<T> & Record<string, unknown>;
type SqlValue = string | number | boolean | Date | Buffer | null;

interface FieldDefinition {
  key: string;
  column: string;
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
}

function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  throw new TypeError('Repository field cannot be encoded as a MySQL value');
}

interface RepositoryDefinition {
  table: string;
  fields: FieldDefinition[];
  searchColumns: string[];
}

const field = (
  key: string,
  column: string,
  transforms: Pick<FieldDefinition, 'encode' | 'decode'> = {},
): FieldDefinition => ({ key, column, ...transforms });

const booleanField = (key: string, column: string) =>
  field(key, column, { encode: (value) => (value ? 1 : 0), decode: (value) => Boolean(value) });
const jsonField = (key: string, column: string) =>
  field(key, column, {
    encode: (value) => JSON.stringify(value ?? {}),
    decode: (value) => {
      if (typeof value !== 'string') return value ?? {};
      return JSON.parse(value) as Record<string, unknown>;
    },
  });

const definitions = {
  subjects: {
    table: 'subjects',
    fields: [
      field('uid', 'uid'),
      field('displayName', 'display_name'),
      field('avatarUrl', 'avatar_url'),
    ],
    searchColumns: ['uid', 'display_name'],
  },
  roles: {
    table: 'roles',
    fields: [field('key', 'role_key'), field('name', 'name')],
    searchColumns: ['role_key', 'name'],
  },
  permissions: {
    table: 'permissions',
    fields: [field('action', 'action'), field('resource', 'resource')],
    searchColumns: ['action', 'resource'],
  },
  rolePermissions: {
    table: 'role_permissions',
    fields: [
      field('roleKey', 'role_key'),
      field('action', 'action'),
      field('resource', 'resource'),
      field('effect', 'effect'),
    ],
    searchColumns: ['role_key', 'action', 'resource'],
  },
  roleAssignments: {
    table: 'role_assignments',
    fields: [
      field('subjectUid', 'subject_uid'),
      field('roleKey', 'role_key'),
      field('expiresAt', 'expires_at'),
    ],
    searchColumns: ['subject_uid', 'role_key'],
  },
  tagDefinitions: {
    table: 'tag_definitions',
    fields: [field('key', 'tag_key'), field('name', 'name'), field('description', 'description')],
    searchColumns: ['tag_key', 'name', 'description'],
  },
  tagAssignments: {
    table: 'tag_assignments',
    fields: [
      field('subjectUid', 'subject_uid'),
      field('tagKey', 'tag_key'),
      field('expiresAt', 'expires_at'),
    ],
    searchColumns: ['subject_uid', 'tag_key'],
  },
  modules: {
    table: 'modules',
    fields: [
      field('moduleId', 'module_id'),
      field('name', 'name'),
      field('description', 'description'),
      booleanField('enabled', 'enabled'),
    ],
    searchColumns: ['module_id', 'name', 'description'],
  },
  moduleOwners: {
    table: 'module_owners',
    fields: [
      field('moduleId', 'module_id'),
      field('ownerType', 'owner_type'),
      field('ownerId', 'owner_id'),
    ],
    searchColumns: ['module_id', 'owner_type', 'owner_id'],
  },
  auditLogs: {
    table: 'audit_logs',
    fields: [
      field('actorUid', 'actor_uid'),
      field('action', 'action'),
      field('resourceType', 'resource_type'),
      field('resourceId', 'resource_id'),
      jsonField('details', 'details'),
    ],
    searchColumns: ['actor_uid', 'action', 'resource_type', 'resource_id'],
  },
  knowledge: {
    table: 'knowledge_entries',
    fields: [field('type', 'entry_type'), field('title', 'title'), field('body', 'body')],
    searchColumns: ['title', 'body'],
  },
  announcements: {
    table: 'announcements',
    fields: [field('title', 'title'), field('body', 'body')],
    searchColumns: ['title', 'body'],
  },
  consultations: {
    table: 'consultations',
    fields: [
      field('title', 'title'),
      field('body', 'body'),
      field('requesterUid', 'requester_uid'),
    ],
    searchColumns: ['title', 'body', 'requester_uid'],
  },
  clubs: {
    table: 'clubs',
    fields: [field('name', 'name'), field('description', 'description')],
    searchColumns: ['name', 'description'],
  },
  clubMemberships: {
    table: 'club_memberships',
    fields: [field('clubId', 'club_id'), field('memberUid', 'member_uid')],
    searchColumns: ['club_id', 'member_uid'],
  },
  activities: {
    table: 'activities',
    fields: [
      field('title', 'title'),
      field('description', 'description'),
      field('clubId', 'club_id'),
      field('startsAt', 'starts_at'),
    ],
    searchColumns: ['title', 'description'],
  },
  activityRegistrations: {
    table: 'activity_registrations',
    fields: [field('activityId', 'activity_id'), field('participantUid', 'participant_uid')],
    searchColumns: ['activity_id', 'participant_uid'],
  },
  sportsTeams: {
    table: 'sports_teams',
    fields: [field('name', 'name'), field('description', 'description')],
    searchColumns: ['name', 'description'],
  },
  sportsCheckins: {
    table: 'sports_checkins',
    fields: [
      field('teamId', 'team_id'),
      field('memberUid', 'member_uid'),
      field('checkinDate', 'checkin_date'),
    ],
    searchColumns: ['team_id', 'member_uid'],
  },
  liaisonResources: {
    table: 'liaison_resources',
    fields: [
      field('name', 'name'),
      field('description', 'description'),
      field('category', 'category'),
      field('visibility', 'visibility'),
    ],
    searchColumns: ['name', 'description', 'category'],
  },
  financeRecords: {
    table: 'finance_records',
    fields: [
      field('title', 'title'),
      field('kind', 'record_kind'),
      field('amountCents', 'amount_cents', { decode: (value) => Number(value) }),
      field('activityId', 'activity_id'),
    ],
    searchColumns: ['title', 'record_kind'],
  },
} satisfies Record<string, RepositoryDefinition>;

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
  return new Date(String(value)).toISOString();
}

class MySqlRepository<T extends StoredRecord> implements RecordRepository<T> {
  constructor(
    private readonly executor: Executor,
    private readonly definition: RepositoryDefinition,
  ) {}

  async create(input: NewRecord<T>): Promise<T> {
    const recordInput = input as RecordInput<T>;
    const id = randomUUID();
    const now = new Date();
    const columns = [
      'id',
      ...this.definition.fields.map(({ column }) => column),
      'status',
      'owner_uid',
      'scope_type',
      'scope_id',
      'created_at',
      'updated_at',
    ];
    const values: SqlValue[] = [
      id,
      ...this.definition.fields.map(({ key, encode }) =>
        toSqlValue(encode ? encode(recordInput[key]) : recordInput[key]),
      ),
      input.status,
      input.ownerUid,
      input.scope.type,
      input.scope.id,
      now,
      now,
    ];
    const placeholders = columns.map(() => '?').join(', ');
    await this.executor.execute(
      `INSERT INTO ${this.definition.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    const created = await this.get(id);
    if (!created) throw new Error(`Failed to read created ${this.definition.table} record`);
    return created;
  }

  async get(id: string): Promise<T | null> {
    const [rows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT * FROM ${this.definition.table} WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row ? this.decode(row) : null;
  }

  async list(filters: ListFilters = {}): Promise<T[]> {
    const clauses: string[] = [];
    const values: SqlValue[] = [];
    if (filters.status) {
      clauses.push('status = ?');
      values.push(filters.status);
    }
    if (filters.scopeType) {
      clauses.push('scope_type = ?');
      values.push(filters.scopeType);
    }
    if (filters.scopeId) {
      clauses.push('scope_id = ?');
      values.push(filters.scopeId);
    }
    if (filters.query?.trim() && this.definition.searchColumns.length > 0) {
      clauses.push(`LOWER(CONCAT_WS(' ', ${this.definition.searchColumns.join(', ')})) LIKE ?`);
      values.push(`%${filters.query.trim().toLocaleLowerCase()}%`);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT * FROM ${this.definition.table}${where} ORDER BY created_at DESC`,
      values,
    );
    return rows.map((row) => this.decode(row));
  }

  async update(id: string, patch: RecordPatch<T>): Promise<T | null> {
    const patchRecord = patch as Record<string, unknown>;
    const assignments: string[] = [];
    const values: SqlValue[] = [];
    for (const { key, column, encode } of this.definition.fields) {
      if (!Object.hasOwn(patchRecord, key)) continue;
      assignments.push(`${column} = ?`);
      values.push(toSqlValue(encode ? encode(patchRecord[key]) : patchRecord[key]));
    }
    if (Object.hasOwn(patchRecord, 'status') && patch.status !== undefined) {
      assignments.push('status = ?');
      values.push(patch.status);
    }
    if (Object.hasOwn(patchRecord, 'ownerUid') && patch.ownerUid !== undefined) {
      assignments.push('owner_uid = ?');
      values.push(patch.ownerUid);
    }
    if (Object.hasOwn(patchRecord, 'scope') && patch.scope) {
      assignments.push('scope_type = ?', 'scope_id = ?');
      values.push(patch.scope.type, patch.scope.id);
    }
    if (assignments.length === 0) return this.get(id);
    assignments.push('updated_at = ?');
    values.push(new Date(), id);
    const [result] = await this.executor.execute<ResultSetHeader>(
      `UPDATE ${this.definition.table} SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0 ? this.get(id) : null;
  }

  async delete(id: string): Promise<boolean> {
    const [result] = await this.executor.execute<ResultSetHeader>(
      `DELETE FROM ${this.definition.table} WHERE id = ?`,
      [id],
    );
    return result.affectedRows > 0;
  }

  private decode(row: RowDataPacket): T {
    const record: Record<string, unknown> = {
      id: String(row.id),
      status: String(row.status),
      ownerUid: String(row.owner_uid),
      scope: { type: String(row.scope_type), id: String(row.scope_id) },
      createdAt: normalizeDate(row.created_at),
      updatedAt: normalizeDate(row.updated_at),
    };
    for (const { key, column, decode } of this.definition.fields) {
      record[key] = decode?.(row[column]) ?? row[column];
    }
    return record as T;
  }
}

function buildMySqlStore(executor: Executor, pool: Pool, inTransaction: boolean): DevelopmentStore {
  const repository = <T extends StoredRecord>(definition: RepositoryDefinition) =>
    new MySqlRepository<T>(executor, definition);
  const store: DevelopmentStore = {
    async transaction<T>(operation: (transactionStore: DevelopmentStore) => Promise<T>) {
      if (inTransaction) return operation(store);
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      try {
        const result = await operation(buildMySqlStore(connection, pool, true));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    subjects: repository<SubjectRecord>(definitions.subjects),
    roles: repository<RoleRecord>(definitions.roles),
    permissions: repository<PermissionRecord>(definitions.permissions),
    rolePermissions: repository<RolePermissionRecord>(definitions.rolePermissions),
    roleAssignments: repository<RoleAssignmentRecord>(definitions.roleAssignments),
    tagDefinitions: repository<TagDefinitionRecord>(definitions.tagDefinitions),
    tagAssignments: repository<TagAssignmentRecord>(definitions.tagAssignments),
    modules: repository<ModuleRecord>(definitions.modules),
    moduleOwners: repository<ModuleOwnerRecord>(definitions.moduleOwners),
    auditLogs: repository<AuditLogRecord>(definitions.auditLogs),
    knowledge: repository<KnowledgeEntryRecord>(definitions.knowledge),
    announcements: repository<AnnouncementRecord>(definitions.announcements),
    consultations: repository<ConsultationRecord>(definitions.consultations),
    clubs: repository<ClubRecord>(definitions.clubs),
    clubMemberships: repository<ClubMembershipRecord>(definitions.clubMemberships),
    activities: repository<ActivityRecord>(definitions.activities),
    activityRegistrations: repository<ActivityRegistrationRecord>(
      definitions.activityRegistrations,
    ),
    sportsTeams: repository<SportsTeamRecord>(definitions.sportsTeams),
    sportsCheckins: repository<SportsCheckinRecord>(definitions.sportsCheckins),
    liaisonResources: repository<LiaisonResourceRecord>(definitions.liaisonResources),
    financeRecords: repository<FinanceRecord>(definitions.financeRecords),
  };
  return store;
}

export interface MySqlStoreOptions {
  pool?: Pool;
  config?: MySqlConfig;
  environment?: NodeJS.ProcessEnv;
}

export interface MySqlStoreHandle {
  store: DevelopmentStore;
  pool: Pool;
  close(): Promise<void>;
}

export function createMySqlStore(options: MySqlStoreOptions = {}): MySqlStoreHandle {
  const pool =
    options.pool ??
    createPool({
      ...(options.config ?? loadMySqlConfig(options.environment)),
      connectionLimit: 10,
      dateStrings: true,
    });
  return {
    store: buildMySqlStore(pool, pool, false),
    pool,
    close: () => pool.end(),
  };
}
