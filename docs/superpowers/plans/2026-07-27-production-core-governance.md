# Production Core Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产空库可安全自举首位最高管理员，并使数据库中的角色、权限、Tag、作用域、模块和负责人真正成为运行时授权与七区管理后台的权威。

**Architecture:** 在现有 `DevelopmentStore` 上增加治理 schema、分页和 `tag_permissions`，由 bootstrap 服务原子写入内置定义。认证成功后同步 subject，并把有效数据库绑定编译为统一 `AuthorizationPolicy[]`；Admin API 和 React 页面只通过受审计治理接口读写这些对象。

**Tech Stack:** Node.js 20.19+、TypeScript、Express、Zod、React、MySQL 8.4、mysql2、Vitest、Supertest、npm workspaces。

## Global Constraints

- 生产基础路径保持 `/development/`，API 前缀保持 `/api/development/v1`。
- 主站仍是认证权威；跨系统用户键只使用主站稳定 `uid`，不保存主站密码或共享 `AUTH_SECRET`。
- 生产必须使用 MySQL；demo seed 不得作为生产初始化。
- 权限由后端按角色、动作、资源、作用域、Tag 与有效期判断；任何未知、停用、过期或未绑定对象默认拒绝。
- `sports.team_captain` 必须绑定具体 `sports_team:<team-id>`，不得使用通配作用域。
- 内置 15 个角色 key 和 9 个 module id 不得重命名或删除。
- 所有治理写操作与审计记录必须处于同一事务；拒绝日志不得因业务事务回滚而丢失。
- 所有新增行为遵循 RED → GREEN → REFACTOR；每个任务独立提交并接受独立评审。

---

### Task 1: 治理 schema、存储类型与分页原语

**Files:**

- Create: `database/migrations/004_production_governance.sql`
- Create: `apps/api/src/core/database/governance-schema.test.ts`
- Create: `apps/api/src/core/database/record-repository-page.test.ts`
- Modify: `apps/api/src/core/database/types.ts`
- Modify: `apps/api/src/core/database/memory-store.ts`
- Modify: `apps/api/src/core/database/mysql-store.ts`
- Modify: `apps/api/src/core/database/migration-smoke.test.ts`
- Modify: `apps/api/src/core/database/tag-definition-contract.test.ts`
- Modify: `apps/api/src/core/database/mysql-store.test.ts`

**Interfaces:**

```ts
export interface TagPermissionRecord extends StoredRecord {
  tagKey: string;
  action: PermissionAction;
  resource: string;
  effect: 'allow' | 'deny';
}

export interface PageRequest {
  page: number;
  pageSize: number;
}
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RecordRepository<T extends StoredRecord> {
  create(input: NewRecord<T>): Promise<T>;
  get(id: string): Promise<T | null>;
  getForUpdate(id: string): Promise<T | null>;
  list(filters?: ListFilters): Promise<T[]>;
  page(filters: ListFilters | undefined, request: PageRequest): Promise<Page<T>>;
  update(id: string, patch: RecordPatch<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 1: 写失败测试**

```ts
expect(sql).toContain('CREATE TABLE tag_permissions');
expect(sql).toContain('FOREIGN KEY (role_key) REFERENCES roles(role_key)');
expect(await store.auditLogs.page(undefined, { page: 2, pageSize: 2 })).toMatchObject({
  page: 2,
  pageSize: 2,
  total: 5,
  items: expect.any(Array),
});
```

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/core/database/governance-schema.test.ts apps/api/src/core/database/record-repository-page.test.ts`

Expected: FAIL because migration 004, `tagPermissions` and `page()` do not exist.

- [ ] **Step 3: 实现最小 schema 与两种 store adapter**

Migration 004 creates `tag_permissions`, adds foreign keys for role permissions/assignments, tag permissions/assignments and module owners, and rejects orphan rows before adding constraints. `module_owners.owner_id` remains polymorphic and is validated by service code. MySQL paging uses parameterized `LIMIT/OFFSET`; memory paging uses the same stable sort and bounds `page >= 1`, `1 <= pageSize <= 100`.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/core/database/governance-schema.test.ts apps/api/src/core/database/record-repository-page.test.ts apps/api/src/core/database/migration-smoke.test.ts apps/api/src/core/database/mysql-store.test.ts apps/api/src/core/database/memory-store.test.ts`

Expected: all listed tests PASS with identical memory/MySQL contracts.

- [ ] **Step 5: 提交**

```powershell
git add database/migrations/004_production_governance.sql apps/api/src/core/database
git commit -m "feat: add production governance storage"
```

---

### Task 2: 内置治理目录与 bootstrap 服务

**Files:**

- Create: `apps/api/src/core/bootstrap/built-in-definitions.ts`
- Create: `apps/api/src/core/bootstrap/bootstrap-service.ts`
- Create: `apps/api/src/core/bootstrap/bootstrap-service.test.ts`
- Modify: `apps/api/src/core/authorization/permission-catalog.ts`
- Modify: `packages/contracts/src/modules.ts`
- Modify: `packages/contracts/src/permissions.ts`
- Modify: `packages/contracts/src/permissions.test.ts`

**Interfaces:**

```ts
export interface BootstrapInput {
  uid: string;
  recovery: boolean;
  version: string;
  now: Date;
}
export interface BootstrapResult {
  uid: string;
  subjectId: string;
  roleAssignmentId: string;
  recovered: boolean;
}
export async function bootstrapPlatform(
  store: DevelopmentStore,
  input: BootstrapInput,
): Promise<BootstrapResult>;
```

- [ ] **Step 1: 写失败测试**

```ts
const result = await bootstrapPlatform(store, {
  uid: 'u_20260727_admin',
  recovery: false,
  version: '834a804',
  now,
});
expect(result.recovered).toBe(false);
expect((await store.roles.list()).map((role) => role.key)).toEqual(
  expect.arrayContaining(ROLE_KEYS),
);
expect(await store.roleAssignments.list({ query: 'u_20260727_admin' })).toHaveLength(1);
expect((await store.modules.list()).map((item) => item.moduleId)).toEqual(MODULE_IDS);
await expect(
  bootstrapPlatform(store, { uid: 'u_second', recovery: false, version: '834a804', now }),
).rejects.toMatchObject({ code: 'super_admin_already_exists' });
```

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/core/bootstrap/bootstrap-service.test.ts packages/contracts/src/permissions.test.ts`

Expected: FAIL because bootstrap definitions and service are missing.

- [ ] **Step 3: 实现原子 bootstrap**

Insert exactly all `ROLE_KEYS`, permission definitions, role bindings, `sports.team_captain`, its scoped tag permissions, all modules, the subject (`displayName = uid`, `avatarUrl = null`), super-admin assignment and audit event. Do not include demo-only `extension.custom`. Normal mode refuses any active super admin; recovery mode writes action `platform.bootstrap.recovery` and still refuses duplicate target assignment.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/core/bootstrap/bootstrap-service.test.ts packages/contracts/src/permissions.test.ts apps/api/src/core/authorization/permission-matrix.test.ts`

Expected: bootstrap, catalog and existing permission matrix tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/core/bootstrap apps/api/src/core/authorization/permission-catalog.ts packages/contracts/src
git commit -m "feat: add production governance bootstrap service"
```

---

### Task 3: 受控 bootstrap CLI

**Files:**

- Create: `scripts/admin-bootstrap.mjs`
- Create: `tests/scripts/admin-bootstrap.test.mjs`
- Modify: `package.json`
- Modify: `deploy/docker/api.Dockerfile`
- Modify: `docs/data-administration.md`

**Interfaces:**

```js
export function parseBootstrapArguments(argv) {}
export async function runBootstrapCli(options = {}) {}
```

- [ ] **Step 1: 写参数与门禁失败测试**

```js
assert.deepEqual(
  parseBootstrapArguments([
    '--uid',
    'u_20260727_admin',
    '--confirm',
    'BOOTSTRAP_SUPER_ADMIN:u_20260727_admin',
  ]),
  {
    uid: 'u_20260727_admin',
    confirm: 'BOOTSTRAP_SUPER_ADMIN:u_20260727_admin',
    recovery: false,
    help: false,
  },
);
await assert.rejects(
  () => runBootstrapCli({ environment: { NODE_ENV: 'development' } }),
  /production/,
);
await assert.rejects(
  () =>
    runBootstrapCli({ environment: productionEnv, argv: ['--uid', 'u_x', '--confirm', 'wrong'] }),
  /confirmation/,
);
```

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/scripts/admin-bootstrap.test.mjs`

Expected: FAIL because the script and npm command are missing.

- [ ] **Step 3: 实现 CLI**

Add root script `"admin:bootstrap": "node scripts/admin-bootstrap.mjs"`. Require `NODE_ENV=production`, `DATA_MODE=mysql`, exact normal/recovery confirmation strings, current migration checksums and a database advisory lock. Reject unknown flags and any password/token/SQL flag; close the store and release the lock on success or failure.

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/scripts/admin-bootstrap.test.mjs && npm run admin:bootstrap -- --help`

Expected: all script tests PASS and help exits 0 without opening MySQL.

- [ ] **Step 5: 提交**

```powershell
git add scripts/admin-bootstrap.mjs tests/scripts/admin-bootstrap.test.mjs package.json deploy/docker/api.Dockerfile docs/data-administration.md
git commit -m "feat: add controlled administrator bootstrap cli"
```

---

### Task 4: 数据库驱动授权与 subject 同步

**Files:**

- Create: `apps/api/src/core/authorization/load-authorization-context.ts`
- Create: `apps/api/src/core/authorization/load-authorization-context.test.ts`
- Create: `apps/api/src/core/auth/subject-sync.test.ts`
- Modify: `apps/api/src/core/auth/auth-middleware.ts`
- Modify: `apps/api/src/core/authorization/authorize.ts`
- Modify: `apps/api/src/core/authorization/policy.ts`
- Modify: `apps/api/src/core/auth/auth-middleware.test.ts`
- Modify: `apps/api/src/core/authorization/permission-matrix.test.ts`

**Interfaces:**

```ts
export async function synchronizeSubject(
  store: DevelopmentStore,
  identity: UserContext,
  now: Date,
): Promise<SubjectRecord>;
export async function loadAuthorizationContext(
  store: DevelopmentStore,
  identity: UserContext,
  now: Date,
): Promise<AuthorizationContext>;
```

- [ ] **Step 1: 写数据库权威失败测试**

```ts
const context = await loadAuthorizationContext(store, identity, now);
expect(authorize(context, request('knowledge.entry.publish', 'knowledge_entry')).allowed).toBe(
  true,
);
await store.rolePermissions.update(binding.id, { status: 'inactive' });
const revoked = await loadAuthorizationContext(store, identity, now);
expect(authorize(revoked, request('knowledge.entry.publish', 'knowledge_entry')).allowed).toBe(
  false,
);
```

Also assert inactive role/tag definition, expired assignment, disabled module, unknown action and invalid captain scope all deny; main auth upserts display name/avatar while demo auth does not sync production subjects.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/core/authorization/load-authorization-context.test.ts apps/api/src/core/auth/subject-sync.test.ts`

Expected: FAIL because runtime still uses `ROLE_PERMISSION_CATALOG` and captain special cases.

- [ ] **Step 3: 实现统一 policy 编译**

Load active definitions and bindings from the store, validate actions against the code catalog, combine assignment and binding scopes, and emit only `AuthorizationPolicy[]`. `authorize()` keeps one precedence path: matching deny, then most-specific scope, then current allow; no separate role or captain branch remains.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/core/authorization/load-authorization-context.test.ts apps/api/src/core/auth/subject-sync.test.ts apps/api/src/core/auth apps/api/src/core/authorization`

Expected: all auth and authorization regression tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/core/auth apps/api/src/core/authorization
git commit -m "feat: load authorization from governance data"
```

---

### Task 5: 用户映射、分配与最后管理员保护 API

**Files:**

- Create: `apps/api/src/modules/admin/subjects-router.ts`
- Create: `apps/api/src/modules/admin/assignments-router.ts`
- Create: `apps/api/src/modules/admin/assignment-service.ts`
- Create: `apps/api/src/modules/admin/subjects-router.test.ts`
- Create: `apps/api/src/modules/admin/last-super-admin.test.ts`
- Modify: `apps/api/src/modules/admin/router.ts`
- Modify: `apps/api/src/modules/admin/schemas.ts`
- Modify: `apps/api/src/modules/admin/router.test.ts`

**Interfaces:**

```text
GET /admin/subjects?query&status&scopeType&scopeId&page&pageSize
GET /admin/subjects/:uid
GET|POST /admin/role-assignments
DELETE /admin/role-assignments/:assignmentId
GET|POST /admin/tag-assignments
DELETE /admin/tag-assignments/:assignmentId
```

- [ ] **Step 1: 写失败测试**

Assert assignment creation validates subject/definition/scope/expiry, returns 409 on duplicates, archives rather than deletes, and refuses revoking the last active `platform.super_admin` inside a locking transaction.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/admin/subjects-router.test.ts apps/api/src/modules/admin/last-super-admin.test.ts`

Expected: FAIL because routes and last-admin guard are missing.

- [ ] **Step 3: 实现服务与路由**

Use `Page<T>`, page bounds 1..100, Zod schemas and structured audit details. For DELETE, lock the assignment, count current super-admin assignments, update status to `inactive`, and return 409 `last_super_admin` before mutation when count is one.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/admin/subjects-router.test.ts apps/api/src/modules/admin/last-super-admin.test.ts apps/api/src/modules/admin/assignment-conflict.test.ts apps/api/src/modules/admin/router.test.ts`

Expected: all listed admin tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/admin
git commit -m "feat: govern subjects and scoped assignments"
```

---

### Task 6: 角色权限与 Tag 定义治理 API

**Files:**

- Create: `apps/api/src/modules/admin/permissions-router.ts`
- Create: `apps/api/src/modules/admin/tags-router.ts`
- Create: `apps/api/src/modules/admin/permissions-router.test.ts`
- Create: `apps/api/src/modules/admin/tag-definitions-router.test.ts`
- Modify: `apps/api/src/modules/admin/router.ts`
- Modify: `apps/api/src/modules/admin/schemas.ts`

**Interfaces:**

```text
GET /admin/roles
GET /admin/permissions
GET /admin/role-permissions
PUT /admin/roles/:roleKey/permissions
GET|POST /admin/tag-definitions
PATCH /admin/tag-definitions/:tagKey
GET /admin/tag-permissions
PUT /admin/tag-definitions/:tagKey/permissions
```

- [ ] **Step 1: 写 replace-set 与扩展 Tag 失败测试**

```ts
await request(app)
  .put('/api/development/v1/admin/roles/domain.arts_lead/permissions')
  .set(adminHeaders)
  .send({
    bindings: [
      {
        action: 'knowledge.entry.publish',
        resource: 'knowledge_entry',
        effect: 'allow',
        scope: { type: 'public', id: '*' },
      },
    ],
  })
  .expect(200);
```

Assert unknown action/resource, renamed key and unregistered Tag permission return 400/409 and do not partially replace bindings.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/admin/permissions-router.test.ts apps/api/src/modules/admin/tag-definitions-router.test.ts`

Expected: FAIL because governance routes are missing.

- [ ] **Step 3: 实现原子 replace-set**

Validate against built-in permission definitions, lock the definition, archive removed bindings, upsert desired bindings and record old/new binding identities in one audit event. Extension Tag key is immutable after create; built-in role/Tag keys cannot be deleted.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/admin/permissions-router.test.ts apps/api/src/modules/admin/tag-definitions-router.test.ts apps/api/src/modules/admin/router-review-regressions.test.ts apps/api/src/modules/admin/tag-concrete-scope.test.ts`

Expected: all listed tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/admin
git commit -m "feat: manage role and tag permissions"
```

---

### Task 7: 模块负责人、审计分页与系统状态 API

**Files:**

- Create: `apps/api/src/modules/admin/modules-router.ts`
- Create: `apps/api/src/modules/admin/audit-router.ts`
- Create: `apps/api/src/modules/admin/system-router.ts`
- Create: `apps/api/src/modules/admin/module-owners.test.ts`
- Create: `apps/api/src/modules/admin/audit-query.test.ts`
- Create: `apps/api/src/modules/admin/system-router.test.ts`
- Modify: `apps/api/src/modules/admin/router.ts`
- Modify: `apps/api/src/core/modules/registry.ts`

**Interfaces:**

```text
GET|PATCH /admin/modules
GET /admin/modules/:moduleId/owners
PUT /admin/modules/:moduleId/owners
GET /admin/audit-logs?actorUid&action&resourceType&resourceId&from&to&page&pageSize
GET /admin/system-status
```

- [ ] **Step 1: 写失败测试**

Assert owner targets exist for `role|subject|team`, replace-set is atomic, disabling a module immediately removes its policies, audit order is `createdAt DESC, id DESC`, and system status exposes no host/password/token.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/admin/module-owners.test.ts apps/api/src/modules/admin/audit-query.test.ts apps/api/src/modules/admin/system-router.test.ts`

Expected: FAIL because routes and filters are missing.

- [ ] **Step 3: 实现三个 focused routers**

Keep `router.ts` as composition only. System status returns version, data mode, applied migration count and module counts; readiness belongs to the deployment plan and is not duplicated here.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/admin/module-owners.test.ts apps/api/src/modules/admin/audit-query.test.ts apps/api/src/modules/admin/system-router.test.ts apps/api/src/modules/admin/router.test.ts`

Expected: all listed tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/admin apps/api/src/core/modules/registry.ts
git commit -m "feat: manage modules owners and audit queries"
```

---

### Task 8: 共享治理契约与七区 Admin 页面

**Files:**

- Create: `packages/contracts/src/admin.ts`
- Create: `packages/contracts/src/admin.test.ts`
- Create: `apps/web/src/modules/admin/AdminSectionNav.tsx`
- Create: `apps/web/src/modules/admin/sections/SubjectsAssignmentsSection.tsx`
- Create: `apps/web/src/modules/admin/sections/RolesPermissionsSection.tsx`
- Create: `apps/web/src/modules/admin/sections/TagDefinitionsSection.tsx`
- Create: `apps/web/src/modules/admin/sections/ModulesOwnersSection.tsx`
- Create: `apps/web/src/modules/admin/sections/BusinessEntrySection.tsx`
- Create: `apps/web/src/modules/admin/sections/AuditLogsSection.tsx`
- Create: `apps/web/src/modules/admin/sections/SystemStatusSection.tsx`
- Create: `apps/web/src/modules/admin/AdminPage.governance.test.tsx`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/web/src/modules/admin/AdminPage.tsx`
- Modify: `apps/web/src/modules/admin/AdminPage.test.tsx`
- Modify: `apps/web/src/styles/components.css`

**Interfaces:** `AdminPageProps.client?: Pick<ApiClient, 'request'>`; every section consumes typed `Page<T>`/governance contracts and owns one responsibility.

- [ ] **Step 1: 写七区失败测试**

```ts
for (const label of [
  '用户与授权',
  '角色与权限',
  'Tag 定义',
  '模块与负责人',
  '业务数据入口',
  '审计日志',
  '系统状态',
]) {
  expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
}
```

Test role/tag scope and expiry fields, confirmation text showing affected UID/scope, binding replace, owner validation error, paged audit filters and internal keys rendered read-only.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run packages/contracts/src/admin.test.ts apps/web/src/modules/admin/AdminPage.governance.test.tsx`

Expected: FAIL because contracts and section components are missing.

- [ ] **Step 3: 实现分区后台**

Use accessible tabs/landmarks. Business Entry only shows aggregate counts, anomalies and links to domain pages; it does not duplicate domain editors. All dangerous mutations show impact and wait for server success before updating UI.

- [ ] **Step 4: 运行 GREEN 与计划门禁**

Run: `npx vitest run packages/contracts/src/admin.test.ts apps/web/src/modules/admin/AdminPage.test.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx && npm run typecheck && npm run build`

Expected: contracts, Admin UI, typecheck and production build PASS.

- [ ] **Step 5: 提交**

```powershell
git add packages/contracts/src apps/web/src/modules/admin apps/web/src/styles/components.css
git commit -m "feat: add complete governance administration ui"
```

## Plan Verification

Run after Task 8:

```powershell
npx vitest run apps/api/src/core/bootstrap apps/api/src/core/authorization apps/api/src/core/auth apps/api/src/modules/admin
node --test tests/scripts/admin-bootstrap.test.mjs
npx vitest run packages/contracts/src apps/web/src/modules/admin
npm run check
```

Expected: every command exits 0. A real MySQL 8 bootstrap is additionally required by the deployment plan before production release.
