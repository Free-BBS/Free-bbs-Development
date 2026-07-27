import { randomUUID } from 'node:crypto';

import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';

import { queryMySqlAuditLogs } from './audit-query.js';
import {
  decodeDateOnly,
  decodeUtcDateTime,
  encodeDateOnly,
  encodeUtcDateTime,
} from './date-codec.js';
import { loadMySqlConfig, type MySqlConfig } from './migrate.js';
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
  SportsTeamMemberRecord,
  SportsTeamRecord,
  StoredRecord,
  SubjectRecord,
  TagAssignmentRecord,
  TagDefinitionRecord,
  TagPermissionRecord,
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
  conflictMessage?: string;
}

const field = (
  key: string,
  column: string,
  transforms: Pick<FieldDefinition, 'encode' | 'decode'> = {},
): FieldDefinition => ({ key, column, ...transforms });

const booleanField = (key: string, column: string) =>
  field(key, column, { encode: (value) => (value ? 1 : 0), decode: (value) => Boolean(value) });
const utcDateTimeField = (key: string, column: string) =>
  field(key, column, {
    encode: (value) => encodeUtcDateTime(value as string | Date | null | undefined),
    decode: (value) => (value === null || value === undefined ? null : decodeUtcDateTime(value)),
  });
const dateOnlyField = (key: string, column: string) =>
  field(key, column, {
    encode: (value) => encodeDateOnly(String(value)),
    decode: (value) => decodeDateOnly(String(value)),
  });
const safeIntegerField = (key: string, column: string) =>
  field(key, column, {
    encode: (value) => safeInteger(value),
    decode: (value) => safeInteger(value),
  });
const jsonField = (key: string, column: string) =>
  field(key, column, {
    encode: (value) => JSON.stringify(value ?? {}),
    decode: (value) => {
      if (typeof value !== 'string') return value ?? {};
      return JSON.parse(value) as Record<string, unknown>;
    },
  });
function safeInteger(value: unknown): number {
  const number =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : (value as number);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError('amountCents must be a non-negative safe integer');
  }
  return number;
}

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
    conflictMessage: 'Assignment already exists',
    fields: [
      field('subjectUid', 'subject_uid'),
      field('roleKey', 'role_key'),
      utcDateTimeField('expiresAt', 'expires_at'),
    ],
    searchColumns: ['subject_uid', 'role_key'],
  },
  tagDefinitions: {
    table: 'tag_definitions',
    fields: [
      field('key', 'tag_key'),
      field('name', 'name'),
      field('description', 'description'),
      field('requiredScopeType', 'required_scope_type'),
      jsonField('metadata', 'metadata'),
    ],
    searchColumns: ['tag_key', 'name', 'description'],
  },
  tagAssignments: {
    table: 'tag_assignments',
    conflictMessage: 'Assignment already exists',
    fields: [
      field('subjectUid', 'subject_uid'),
      field('tagKey', 'tag_key'),
      utcDateTimeField('expiresAt', 'expires_at'),
    ],
    searchColumns: ['subject_uid', 'tag_key'],
  },
  tagPermissions: {
    table: 'tag_permissions',
    conflictMessage: 'Tag permission already exists',
    fields: [
      field('tagKey', 'tag_key'),
      field('action', 'action'),
      field('resource', 'resource'),
      field('effect', 'effect'),
    ],
    searchColumns: ['tag_key', 'action', 'resource'],
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
      field('assigneeUid', 'assignee_uid'),
      field('reply', 'reply'),
    ],
    searchColumns: ['title', 'body', 'requester_uid', 'assignee_uid', 'reply'],
  },
  clubs: {
    table: 'clubs',
    fields: [
      field('name', 'name'),
      field('description', 'description'),
      field('technicalSupportStatus', 'technical_support_status'),
      field('technicalSupportNote', 'technical_support_note'),
    ],
    searchColumns: ['name', 'description', 'technical_support_note'],
  },
  clubMemberships: {
    table: 'club_memberships',
    conflictMessage: 'Membership already exists',
    fields: [field('clubId', 'club_id'), field('memberUid', 'member_uid')],
    searchColumns: ['club_id', 'member_uid'],
  },
  activities: {
    table: 'activities',
    fields: [
      field('title', 'title'),
      field('description', 'description'),
      field('clubId', 'club_id'),
      utcDateTimeField('startsAt', 'starts_at'),
      field('technicalSupportStatus', 'technical_support_status'),
      field('technicalSupportNote', 'technical_support_note'),
    ],
    searchColumns: ['title', 'description', 'technical_support_note'],
  },
  activityRegistrations: {
    table: 'activity_registrations',
    conflictMessage: 'Registration already exists',
    fields: [field('activityId', 'activity_id'), field('participantUid', 'participant_uid')],
    searchColumns: ['activity_id', 'participant_uid'],
  },
  sportsTeams: {
    table: 'sports_teams',
    fields: [field('name', 'name'), field('description', 'description')],
    searchColumns: ['name', 'description'],
  },
  sportsTeamMembers: {
    table: 'sports_team_members',
    conflictMessage: 'Membership already exists',
    fields: [field('teamId', 'team_id'), field('memberUid', 'member_uid')],
    searchColumns: ['team_id', 'member_uid'],
  },
  sportsCheckins: {
    table: 'sports_checkins',
    conflictMessage: 'Check-in already exists',
    fields: [
      field('teamId', 'team_id'),
      field('memberUid', 'member_uid'),
      dateOnlyField('checkinDate', 'checkin_date'),
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
      safeIntegerField('amountCents', 'amount_cents'),
      field('activityId', 'activity_id'),
    ],
    searchColumns: ['title', 'record_kind'],
  },
} satisfies Record<string, RepositoryDefinition>;
function escapeLikeQuery(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function isDuplicateEntryError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062;
}

function validatePageRequest(request: PageRequest): void {
  if (!Number.isInteger(request.page) || request.page < 1) {
    throw new RangeError('page must be an integer greater than or equal to 1');
  }
  if (!Number.isInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 100) {
    throw new RangeError('pageSize must be an integer between 1 and 100');
  }
}

function buildWhere(
  definition: RepositoryDefinition,
  filters: ListFilters,
): { where: string; values: SqlValue[] } {
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
  if (filters.query?.trim() && definition.searchColumns.length > 0) {
    clauses.push(
      `LOWER(CONCAT_WS(' ', ${definition.searchColumns.join(', ')})) LIKE ? ESCAPE '\\\\'`,
    );
    values.push(`%${escapeLikeQuery(filters.query.trim().toLocaleLowerCase())}%`);
  }
  return {
    where: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

class MySqlRepository<T extends StoredRecord> implements RecordRepository<T> {
  constructor(
    private readonly executor: Executor,
    private readonly definition: RepositoryDefinition,
    private readonly allowRowLock: boolean,
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
    try {
      await this.executor.execute(
        `INSERT INTO ${this.definition.table} (${columns.join(', ')}) VALUES (${placeholders})`,
        values,
      );
    } catch (error) {
      if (this.definition.conflictMessage !== undefined && isDuplicateEntryError(error)) {
        throw new RecordConflictError(this.definition.conflictMessage, { cause: error });
      }
      throw error;
    }
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

  async getForUpdate(id: string): Promise<T | null> {
    if (!this.allowRowLock) throw new Error('Row locking requires a store transaction');
    const [rows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT * FROM ${this.definition.table} WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    return row ? this.decode(row) : null;
  }

  async listForUpdate(filters: ListFilters = {}): Promise<T[]> {
    if (!this.allowRowLock) throw new Error('Row locking requires a store transaction');
    const { where, values } = buildWhere(this.definition, filters);
    const [rows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT * FROM ${this.definition.table}${where} ORDER BY id FOR UPDATE`,
      values,
    );
    return rows.map((row) => this.decode(row));
  }

  async list(filters: ListFilters = {}): Promise<T[]> {
    const { where, values } = buildWhere(this.definition, filters);
    const [rows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT * FROM ${this.definition.table}${where} ORDER BY created_at DESC, id DESC`,
      values,
    );
    return rows.map((row) => this.decode(row));
  }

  async page(filters: ListFilters | undefined, request: PageRequest): Promise<Page<T>> {
    validatePageRequest(request);
    const { where, values } = buildWhere(this.definition, filters ?? {});
    const [countRows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ${this.definition.table}${where}`,
      values,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (request.page - 1) * request.pageSize;
    const [rows] = await this.executor.execute<RowDataPacket[]>(
      `SELECT * FROM ${this.definition.table}${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...values, request.pageSize, offset],
    );
    return {
      items: rows.map((row) => this.decode(row)),
      page: request.page,
      pageSize: request.pageSize,
      total,
    };
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
    try {
      const [result] = await this.executor.execute<ResultSetHeader>(
        `UPDATE ${this.definition.table} SET ${assignments.join(', ')} WHERE id = ?`,
        values,
      );
      return result.affectedRows > 0 ? this.get(id) : null;
    } catch (error) {
      if (this.definition.conflictMessage !== undefined && isDuplicateEntryError(error)) {
        throw new RecordConflictError(this.definition.conflictMessage, { cause: error });
      }
      throw error;
    }
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
      createdAt: decodeUtcDateTime(row.created_at),
      updatedAt: decodeUtcDateTime(row.updated_at),
    };
    for (const { key, column, decode } of this.definition.fields) {
      record[key] = decode?.(row[column]) ?? row[column];
    }
    return record as T;
  }
}

function buildMySqlStore(executor: Executor, pool: Pool, inTransaction: boolean): DevelopmentStore {
  const repository = <T extends StoredRecord>(definition: RepositoryDefinition) =>
    new MySqlRepository<T>(executor, definition, inTransaction);
  const store: DevelopmentStore = {
    async transaction<T>(operation: (transactionStore: DevelopmentStore) => Promise<T>) {
      if (inTransaction) return operation(store);
      const connection = await pool.getConnection();
      let transactionStarted = false;
      try {
        await connection.beginTransaction();
        transactionStarted = true;
        const result = await operation(buildMySqlStore(connection, pool, true));
        await connection.commit();
        return result;
      } catch (error) {
        if (transactionStarted) await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    queryAuditLogs: (query) => queryMySqlAuditLogs(executor, query),
    subjects: repository<SubjectRecord>(definitions.subjects),
    roles: repository<RoleRecord>(definitions.roles),
    permissions: repository<PermissionRecord>(definitions.permissions),
    rolePermissions: repository<RolePermissionRecord>(definitions.rolePermissions),
    roleAssignments: repository<RoleAssignmentRecord>(definitions.roleAssignments),
    tagDefinitions: repository<TagDefinitionRecord>(definitions.tagDefinitions),
    tagAssignments: repository<TagAssignmentRecord>(definitions.tagAssignments),
    tagPermissions: repository<TagPermissionRecord>(definitions.tagPermissions),
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
    sportsTeamMembers: repository<SportsTeamMemberRecord>(definitions.sportsTeamMembers),
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
  appliedMigrationCount(): Promise<number>;
  close(): Promise<void>;
}

async function countAppliedMigrations(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT COUNT(*) AS total FROM schema_migrations',
  );
  const count = Number(rows[0]?.total);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('MySQL returned an invalid applied migration count');
  }
  return count;
}

export function buildMySqlPoolOptions(config: MySqlConfig) {
  return { ...config, connectionLimit: 10, dateStrings: true, timezone: 'Z' as const };
}
export function createMySqlStore(options: MySqlStoreOptions = {}): MySqlStoreHandle {
  const pool =
    options.pool ??
    createPool(buildMySqlPoolOptions(options.config ?? loadMySqlConfig(options.environment)));
  return {
    store: buildMySqlStore(pool, pool, false),
    pool,
    appliedMigrationCount: () => countAppliedMigrations(pool),
    close: () => pool.end(),
  };
}
