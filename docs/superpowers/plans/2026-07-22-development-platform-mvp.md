# FreeBBS 发展端完整交互平台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可本地完整预览、可连接 MySQL 并可部署到服务器的 FreeBBS 发展端网站，覆盖平台入口、共享身份、权限后台和全部首批业务模块交互。

**Architecture:** 使用同域路径挂载的模块化单体：React/TypeScript 前端部署在 `/development/`，Express/TypeScript API 部署在 `/api/development/v1/`。生产身份由发展端后端把 Bearer token 转发到主站 `/api/auth/me` 内省，发展端只以主站稳定 `uid` 建立权限和业务关系；本地演示模式使用受限的演示身份适配器。业务模块共享统一契约、权限决策、审计和数据库访问层，但按目录独立。

**Tech Stack:** Node.js 20.19+、npm workspaces、TypeScript、Vite、React、React Router、Express、Zod、MySQL 8/`mysql2`、Vitest、Supertest、Playwright、Docker Compose、Nginx、systemd。

## Global Constraints

- 前端生产基础路径必须是 `/development/`，API 基础路径必须是 `/api/development/v1`。
- 主站 token 的浏览器存储键固定为 `free_bbs_auth_token`。
- 发展端不得复制主站账号密码、直读主站 `users` 表或共享主站 `AUTH_SECRET`；生产鉴权必须调用主站身份内省接口。
- 跨系统用户外键必须使用主站稳定 `uid`，不得使用主站自增 `id` 或学号。
- 生产使用独立 MySQL 8 数据库 `free_bbs_development` 和独立低权限账户；浏览器不得直连数据库。
- 权限必须由后端以“角色 + 动作 + 资源 + 作用域 + Tag”判断，未授予默认拒绝。
- 体育代表队队长必须使用 `sports.team_captain` 并绑定 `sports_team:<team-id>`，不能作为互斥基础角色。
- 所有模块必须有真实可操作的列表、详情或表单交互；不得用可点击空白页冒充完成。
- 首批模块必须包括：工作台、经验库、信息与咨询、社群与俱乐部、活动、联络资源、体育代表队、财务治理、权限与模块管理后台。
- 视觉以主站当前最终 dashboard shell 为准：`#063641` 侧栏、`#278898` active、`#f4f6f8` 页面、`#dde3e8` 分隔、`#07090b` 主文字、344px 桌面侧栏；不复制主站整份巨型 CSS。
- 桌面导航项高 54px、10px 圆角，内容卡片 8px 圆角；900px 以下切换固定底部导航，680px 以下使用图标上文字下的横向滚动导航。
- 所有用户输入都以纯文本或经过明确净化的 Markdown 渲染；不得用未净化的 `dangerouslySetInnerHTML`。
- 所有新增业务行为遵循 TDD：先运行并观察测试因缺少功能而失败，再实现最小代码使其通过。
- CI 必须执行 lint、format check、typecheck、unit/integration tests、permission matrix、migration smoke test、frontend build、Playwright critical flows。
- 本地默认演示模式必须无需主站和 MySQL即可完成交互；切换到 MySQL 或主站身份只允许通过环境变量，不允许修改源代码。

---

### Task 1: 工作区、共享契约与测试基线

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.prettierrc.json`
- Create: `.gitignore`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/modules.ts`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/permissions.ts`
- Test: `packages/contracts/src/modules.test.ts`
- Test: `packages/contracts/src/permissions.test.ts`

**Interfaces:**
- Produces: `ModuleId`, `ModuleManifest`, `UserContext`, `RoleKey`, `PermissionAction`, `ScopeRef`, `PermissionTag`, `ApiEnvelope<T>`。
- Module IDs: `dashboard`, `knowledge`, `information`, `clubs`, `events`, `liaison`, `sports`, `finance`, `admin`。
- Role keys:
  - `platform.super_admin`
  - `domain.arts_lead`
  - `domain.sports_lead`
  - `domain.liaison_lead`
  - `domain.rights_development_lead`
  - `department.arts_director`
  - `department.sports_director`
  - `department.liaison_director`
  - `department.rights_development_director`
  - `department.arts_member`
  - `department.sports_member`
  - `department.liaison_member`
  - `department.rights_development_member`
  - `affiliation.tuanwei_member`
  - `affiliation.sast_member`
- Ordinary student is the authenticated default and is not represented by an elevated role assignment.

- [ ] **Step 1: 建立 npm workspace 与测试运行器配置**

Root scripts must include:

~~~json
{
  "scripts": {
    "dev": "concurrently -n api,web npm:dev:api npm:dev:web",
    "dev:api": "npm run dev -w @freebbs-development/api",
    "dev:web": "npm run dev -w @freebbs-development/web",
    "build": "npm run build -ws --if-present",
    "test": "vitest run",
    "typecheck": "npm run typecheck -ws --if-present",
    "lint": "eslint .",
    "format:check": "prettier . --check",
    "check": "npm run lint && npm run format:check && npm run typecheck && npm test && npm run build"
  }
}
~~~

Install dependencies through the root lockfile; do not create independent lockfiles in workspaces.

- [ ] **Step 2: 写共享契约失败测试**

The tests must assert all nine module IDs, uniqueness of role keys, and that `sports.team_captain` requires a `sports_team` scope.

~~~ts
expect(MODULE_IDS).toEqual([
  'dashboard',
  'knowledge',
  'information',
  'clubs',
  'events',
  'liaison',
  'sports',
  'finance',
  'admin',
]);
expect(validateTagScope('sports.team_captain', undefined)).toBe(false);
expect(validateTagScope('sports.team_captain', { type: 'sports_team', id: 'team-1' })).toBe(true);
~~~

- [ ] **Step 3: 运行测试并观察正确失败**

Run: `npm test -- packages/contracts/src/modules.test.ts packages/contracts/src/permissions.test.ts`

Expected: FAIL because the contract exports do not exist.

- [ ] **Step 4: 实现最小共享契约**

`ModuleManifest` must contain `id`, `name`, `description`, `route`, `icon`, `ownerTeam`, `status`, `requiredPermissions`, and `order`. `UserContext` must contain `uid`, `displayName`, `avatarUrl`, `baseRole`, `roles`, and `tags`.

- [ ] **Step 5: 验证基线并提交**

Run: `npm run format:check && npm run typecheck && npm test`

Expected: all contract tests pass.

Commit: `chore: scaffold development platform workspace`

---

### Task 2: 数据库迁移、内存演示存储与 Repository 契约

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/core/database/types.ts`
- Create: `apps/api/src/core/database/memory-store.ts`
- Create: `apps/api/src/core/database/mysql-store.ts`
- Create: `apps/api/src/core/database/create-store.ts`
- Create: `apps/api/src/core/database/migrate.ts`
- Create: `database/migrations/001_core.sql`
- Create: `database/migrations/002_domains.sql`
- Create: `database/seeds/001_demo.sql`
- Test: `apps/api/src/core/database/memory-store.test.ts`
- Test: `apps/api/src/core/database/migration-smoke.test.ts`

**Interfaces:**
- Produces: `DevelopmentStore` with transaction, module, subject, assignment, tag, audit and every domain repository.
- Consumes: shared contract IDs and permission types.
- `DATA_MODE=memory|mysql`; default `memory`. MySQL config uses `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`。

- [ ] **Step 1: 写内存存储失败测试**

Test CRUD and isolation for all domain collections: knowledge entries, announcements, consultations, clubs, memberships, activities, registrations, sports teams, check-ins, liaison resources and finance records.

~~~ts
const created = await store.knowledge.create({
  title: '活动复盘模板',
  status: 'published',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
});
expect(await store.knowledge.get(created.id)).toMatchObject({ title: '活动复盘模板' });
~~~

- [ ] **Step 2: 运行测试并观察正确失败**

Run: `npm test -- apps/api/src/core/database/memory-store.test.ts`

Expected: FAIL because `createMemoryStore` is missing.

- [ ] **Step 3: 实现 Repository 与内存模式**

Every write returns the stored record with `id`, `createdAt`, `updatedAt`; list APIs support `status`, `scopeType`, `scopeId`, and text query filters. Seed demo data must include at least two useful records for each business module.

- [ ] **Step 4: 写迁移结构失败测试**

The test must load SQL files and assert tables: `subjects`, `roles`, `permissions`, `role_permissions`, `role_assignments`, `tag_definitions`, `tag_assignments`, `modules`, `module_owners`, `audit_logs`, `knowledge_entries`, `announcements`, `consultations`, `clubs`, `club_memberships`, `activities`, `activity_registrations`, `sports_teams`, `sports_checkins`, `liaison_resources`, `finance_records`。

- [ ] **Step 5: 实现 MySQL adapter 与迁移 CLI**

Use parameterized `mysql2/promise` queries only. Migrations run from an explicit CLI and record checksums in `schema_migrations`; API startup must not run migrations automatically.

- [ ] **Step 6: 运行数据库测试并提交**

Run: `npm test -- apps/api/src/core/database && npm run typecheck -w @freebbs-development/api`

Expected: memory CRUD and migration smoke tests pass.

Commit: `feat: add development database foundation`

---

### Task 3: 主站身份适配、演示身份与权限决策

**Files:**
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/core/auth/auth-client.ts`
- Create: `apps/api/src/core/auth/main-site-auth-client.ts`
- Create: `apps/api/src/core/auth/demo-auth-client.ts`
- Create: `apps/api/src/core/auth/auth-middleware.ts`
- Create: `apps/api/src/core/authorization/permission-catalog.ts`
- Create: `apps/api/src/core/authorization/authorize.ts`
- Create: `apps/api/src/core/authorization/policy.ts`
- Test: `apps/api/src/core/auth/auth-middleware.test.ts`
- Test: `apps/api/src/core/authorization/permission-matrix.test.ts`

**Interfaces:**
- Produces: `AuthClient.introspect(token): Promise<UserContext | null>` and `authorize(context, request): AuthorizationDecision`。
- Production `AUTH_MODE=main` forwards Bearer token to `MAIN_SITE_API_BASE_URL/api/auth/me`.
- Demo `AUTH_MODE=demo` accepts `X-Demo-User` only when the value is in comma-separated `DEMO_USER_IDS`; it must not be enabled when `NODE_ENV=production`。
- Deterministic demo IDs are `demo-student`, `demo-admin`, `demo-sports-lead`, and `demo-captain`。
- Authorization request: `{ action, resource, scope }`; decision: `{ allowed, reason, matchedBy }`。

- [ ] **Step 1: 写身份适配失败测试**

Cover missing bearer, invalid token, main-site timeout, active user mapping by `uid`, and rejection of demo mode in production.

- [ ] **Step 2: 运行身份测试并观察失败**

Run: `npm test -- apps/api/src/core/auth/auth-middleware.test.ts`

Expected: FAIL because auth clients and middleware are missing.

- [ ] **Step 3: 实现身份适配**

Forward the token server-to-server without logging it. Map only `uid`, display name, avatar and main-site coarse role. Return 401 for missing/invalid identity and 503 for unavailable identity provider.

- [ ] **Step 4: 写完整权限矩阵失败测试**

Cover super admin, four domain leads, directors, members, Tuanwei, SAST, ordinary student, multi-role union, expired assignments, explicit scope mismatch and team captain access limited to one team.

~~~ts
expect(
  authorize(captainOf('team-a'), {
    action: 'sports.checkin.create',
    resource: 'sports_checkin',
    scope: { type: 'sports_team', id: 'team-b' },
  }).allowed,
).toBe(false);
~~~

- [ ] **Step 5: 实现权限目录与决策器**

Explicit deny and expired assignment override allow; otherwise union valid role and tag grants; no match means deny. Every decision includes a stable reason string.

- [ ] **Step 6: 运行权限测试并提交**

Run: `npm test -- apps/api/src/core/auth apps/api/src/core/authorization`

Expected: all identity and matrix tests pass.

Commit: `feat: add shared identity and scoped authorization`

---

### Task 4: Express 核心、模块注册与管理后台 API

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/core/errors/http-error.ts`
- Create: `apps/api/src/core/audit/audit-service.ts`
- Create: `apps/api/src/core/modules/registry.ts`
- Create: `apps/api/src/core/modules/manifests.ts`
- Create: `apps/api/src/modules/admin/router.ts`
- Create: `apps/api/src/modules/admin/schemas.ts`
- Test: `apps/api/src/app.test.ts`
- Test: `apps/api/src/modules/admin/router.test.ts`

**Interfaces:**
- Produces endpoints:
  - `GET /api/development/v1/health`
  - `GET /api/development/v1/me`
  - `GET /api/development/v1/modules`
  - `GET/PATCH /api/development/v1/admin/modules`
  - `GET/POST/DELETE /api/development/v1/admin/role-assignments`
  - `GET/POST/DELETE /api/development/v1/admin/tag-assignments`
  - `GET /api/development/v1/admin/audit-logs`
- All responses use `ApiEnvelope<T>` and a request ID.

- [ ] **Step 1: 写核心 API 失败测试**

Assert health exposes only `status`, `version`, `databaseMode`; it must not expose DB host or credentials. Assert module registry returns all nine modules with real status.

- [ ] **Step 2: 运行核心 API 测试并观察失败**

Run: `npm test -- apps/api/src/app.test.ts`

Expected: FAIL because `createApp` is missing.

- [ ] **Step 3: 实现 Express app、CSP/安全头、错误格式和 registry**

Mount only under the versioned base path. CORS is disabled by default for same-origin production; development origin is explicit via `ALLOWED_ORIGINS`.

- [ ] **Step 4: 写管理 API 失败测试**

Assert ordinary user receives 403, super admin can grant/revoke roles and scoped tags, modules can be enabled/disabled, and every write creates an audit record.

- [ ] **Step 5: 实现后台 API 与事务审计**

Role/tag/module writes and audit entry must share one store transaction. Raw database credentials are never returned by any route.

- [ ] **Step 6: 运行测试并提交**

Run: `npm test -- apps/api/src/app.test.ts apps/api/src/modules/admin/router.test.ts`

Expected: all core/admin tests pass.

Commit: `feat: add module registry and administration api`

---

### Task 5: 经验库、信息咨询与联络资源 API

**Files:**
- Create: `apps/api/src/modules/knowledge/manifest.ts`
- Create: `apps/api/src/modules/knowledge/router.ts`
- Create: `apps/api/src/modules/knowledge/service.ts`
- Create: `apps/api/src/modules/information/manifest.ts`
- Create: `apps/api/src/modules/information/router.ts`
- Create: `apps/api/src/modules/information/service.ts`
- Create: `apps/api/src/modules/liaison/manifest.ts`
- Create: `apps/api/src/modules/liaison/router.ts`
- Create: `apps/api/src/modules/liaison/service.ts`
- Test: `apps/api/src/modules/knowledge/router.test.ts`
- Test: `apps/api/src/modules/information/router.test.ts`
- Test: `apps/api/src/modules/liaison/router.test.ts`

**Interfaces:**
- Knowledge: `GET/POST/PATCH /knowledge/entries` with types `workflow|faq|contact|retrospective|notice` and states `draft|published|archived`。
- Information: `GET/POST/PATCH /information/announcements`, `GET/POST/PATCH /information/consultations` with states `submitted|triaged|processing|resolved|closed`。
- Liaison: `GET/POST/PATCH /liaison/resources` with visibility `public|organization|restricted`。

- [ ] **Step 1: 写三个模块的失败测试**

Test public published reads, ordinary consultation submission, maintainer draft publication, restricted resource denial and scope filters.

- [ ] **Step 2: 运行测试并观察失败**

Run: `npm test -- apps/api/src/modules/knowledge apps/api/src/modules/information apps/api/src/modules/liaison`

Expected: FAIL because routers are missing.

- [ ] **Step 3: 实现 Zod schemas、services 和 routers**

All writes use authenticated `uid`, enforce module permissions and emit audit records for publication, status changes and restricted reads.

- [ ] **Step 4: 运行模块测试并提交**

Run: same command as Step 2.

Expected: all module tests pass.

Commit: `feat: add knowledge information and liaison apis`

---

### Task 6: 俱乐部、活动与财务治理 API

**Files:**
- Create: `apps/api/src/modules/clubs/manifest.ts`
- Create: `apps/api/src/modules/clubs/router.ts`
- Create: `apps/api/src/modules/clubs/service.ts`
- Create: `apps/api/src/modules/events/manifest.ts`
- Create: `apps/api/src/modules/events/router.ts`
- Create: `apps/api/src/modules/events/service.ts`
- Create: `apps/api/src/modules/finance/manifest.ts`
- Create: `apps/api/src/modules/finance/router.ts`
- Create: `apps/api/src/modules/finance/service.ts`
- Test: `apps/api/src/modules/clubs/router.test.ts`
- Test: `apps/api/src/modules/events/router.test.ts`
- Test: `apps/api/src/modules/finance/router.test.ts`

**Interfaces:**
- Clubs: list/create/update clubs and join/leave memberships.
- Events: list/create/update activities and register/cancel personal registration.
- Finance: list/create/update budget and settlement records linked to an optional activity; values stored as integer cents.
- State sets: club `draft|active|archived`; activity `draft|open|closed|completed|cancelled`; finance `draft|submitted|approved|settled|rejected`。

- [ ] **Step 1: 写失败测试**

Cover ordinary join/register/cancel, duplicate prevention, closed activity rejection, domain manager updates, finance access restricted to explicit finance permissions and cent-based amounts.

- [ ] **Step 2: 运行测试并观察失败**

Run: `npm test -- apps/api/src/modules/clubs apps/api/src/modules/events apps/api/src/modules/finance`

Expected: FAIL because routers are missing.

- [ ] **Step 3: 实现模块路由和事务行为**

Membership and registration uniqueness is enforced in both store adapters. Finance writes always create audit records and never use floating-point currency.

- [ ] **Step 4: 运行测试并提交**

Run: same command as Step 2.

Expected: all tests pass.

Commit: `feat: add clubs events and finance apis`

---

### Task 7: 体育代表队与队长作用域 API

**Files:**
- Create: `apps/api/src/modules/sports/manifest.ts`
- Create: `apps/api/src/modules/sports/router.ts`
- Create: `apps/api/src/modules/sports/service.ts`
- Test: `apps/api/src/modules/sports/router.test.ts`

**Interfaces:**
- Endpoints:
  - `GET/POST/PATCH /sports/teams`
  - `GET /sports/teams/:teamId/checkins`
  - `POST /sports/teams/:teamId/checkins`
- A captain tag grants read/create only inside its bound team; sports lead grants cross-team management.

- [ ] **Step 1: 写队长隔离失败测试**

Test captain A can check in team A, cannot read/write team B, expired captain tag is denied, sports lead can manage both, ordinary student can only read public team summaries.

- [ ] **Step 2: 运行测试并观察失败**

Run: `npm test -- apps/api/src/modules/sports/router.test.ts`

Expected: FAIL because sports router is missing.

- [ ] **Step 3: 实现体育模块**

Check-ins are idempotent per team, user and date; scope comes from route `teamId`, never from a trusted client-supplied permission object.

- [ ] **Step 4: 运行测试并提交**

Run: same command as Step 2.

Expected: all tests pass.

Commit: `feat: add scoped sports team api`

---

### Task 8: React 外壳、共享登录和主站视觉体系

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/app/module-manifests.ts`
- Create: `apps/web/src/core/api/client.ts`
- Create: `apps/web/src/core/auth/AuthProvider.tsx`
- Create: `apps/web/src/core/auth/DemoUserSwitcher.tsx`
- Create: `apps/web/src/core/permissions/Can.tsx`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/shell.css`
- Create: `apps/web/src/styles/components.css`
- Create: `apps/web/public/favicon-64.png`
- Create: `apps/web/src/assets/icons/*.svg` with project-owned or newly drawn icons
- Test: `apps/web/src/app/AppShell.test.tsx`
- Test: `apps/web/src/core/auth/AuthProvider.test.tsx`

**Interfaces:**
- `ApiClient` reads `free_bbs_auth_token` and sends Bearer token; in demo mode it sends the selected allowlisted identity through `X-Demo-User` instead.
- `AuthProvider` loads `/me`; demo switcher exists only when `VITE_AUTH_MODE=demo`。
- Router basename and Vite base are `/development/`。
- Navigation derives from manifests and module enabled state.

- [ ] **Step 1: 写外壳与身份失败测试**

Assert desktop navigation includes all nine modules, active route is marked, disabled modules show state without dead link, user name/avatar render, 401 shows main-site login action and demo mode shows user switcher.

- [ ] **Step 2: 运行测试并观察失败**

Run: `npm test -- apps/web/src/app/AppShell.test.tsx apps/web/src/core/auth/AuthProvider.test.tsx`

Expected: FAIL because React shell is missing.

- [ ] **Step 3: 实现主站一致的 shell 与响应式 CSS**

Use exact shell tokens from Global Constraints. Do not copy the main site's 253KB stylesheet. Include desktop 344px sidebar, 96px title bar, workbench cards, 900px bottom nav and 680px compact layout.

- [ ] **Step 4: 实现共享登录和权限显示**

Frontend button hiding is presentation only; API 403 remains authoritative. Login action points to main-site `/login` with a safe same-origin return target.

- [ ] **Step 5: 运行前端测试并提交**

Run: `npm test -- apps/web/src/app apps/web/src/core/auth && npm run build -w @freebbs-development/web`

Expected: tests and production subpath build pass.

Commit: `feat: add development app shell and shared auth ui`

---

### Task 9: 全部业务模块的可交互前端页面

**Files:**
- Create: `apps/web/src/modules/dashboard/DashboardPage.tsx`
- Create: `apps/web/src/modules/knowledge/KnowledgePage.tsx`
- Create: `apps/web/src/modules/information/InformationPage.tsx`
- Create: `apps/web/src/modules/clubs/ClubsPage.tsx`
- Create: `apps/web/src/modules/events/EventsPage.tsx`
- Create: `apps/web/src/modules/liaison/LiaisonPage.tsx`
- Create: `apps/web/src/modules/sports/SportsPage.tsx`
- Create: `apps/web/src/modules/finance/FinancePage.tsx`
- Create: `apps/web/src/modules/admin/AdminPage.tsx`
- Create: `apps/web/src/components/RecordList.tsx`
- Create: `apps/web/src/components/StatusBadge.tsx`
- Create: `apps/web/src/components/DialogForm.tsx`
- Create: `apps/web/src/components/EmptyState.tsx`
- Test: one `*.test.tsx` beside every page

**Interfaces:**
- Every page consumes only versioned API client methods.
- Lists support loading, empty, error and success states.
- Write forms show validation errors and refresh data after success.
- Admin page includes module enablement, role assignment, scoped Tag assignment and audit log views.

- [ ] **Step 1: 为九个页面写失败交互测试**

Tests must cover: dashboard module cards; knowledge create/publish; announcement display and consultation submit; club join/leave; activity register/cancel; liaison restricted state; team captain check-in; finance integer-cent display and submit; admin grant/revoke and audit refresh.

- [ ] **Step 2: 运行测试并观察失败**

Run: `npm test -- apps/web/src/modules`

Expected: FAIL because module pages are missing.

- [ ] **Step 3: 实现共享 UI 状态组件**

`DialogForm` traps focus, closes on Escape, labels fields and returns focus to the trigger. Empty/error states must not masquerade as successful content.

- [ ] **Step 4: 实现九个模块页面**

Use cards, tables only for truly tabular admin/finance data, and accessible forms. All mutations require confirmation feedback and keep the user on the current module.

- [ ] **Step 5: 运行页面测试并提交**

Run: `npm test -- apps/web/src/modules apps/web/src/components && npm run build -w @freebbs-development/web`

Expected: all page tests and build pass.

Commit: `feat: add interactive development modules`

---

### Task 10: 本地完整预览、生产部署与后台数据配置

**Files:**
- Create: `apps/api/.env.example`
- Create: `apps/web/.env.example`
- Create: `docker-compose.yml`
- Create: `deploy/docker/api.Dockerfile`
- Create: `deploy/docker/web.Dockerfile`
- Create: `deploy/nginx/freebbs-development.conf`
- Create: `deploy/systemd/freebbs-development-api.service`
- Create: `deploy/systemd/freebbs-development-web.service`
- Create: `scripts/migrate.mjs`
- Create: `scripts/seed.mjs`
- Create: `scripts/backup.sh`
- Create: `docs/local-development.md`
- Create: `docs/server-deployment.md`
- Create: `docs/data-administration.md`
- Test: `tests/deployment/config.test.ts`

**Interfaces:**
- Local commands:
  - `npm ci`
  - `npm run dev` for memory/demo mode
  - `docker compose up --build` for MySQL integration mode
- Production env file: `/etc/freebbs-development/development.env`。
- Nginx routes exact `/development` to 308 `/development/`, serves/proxies `/development/`, and proxies `/api/development/v1/`。
- Adminer, if included, binds only `127.0.0.1` and is disabled by default profile.

- [ ] **Step 1: 写部署配置失败测试**

Parse compose, Nginx and systemd files; assert required services, route prefixes, non-public DB/Adminer ports, non-root containers, environment file path and health checks.

- [ ] **Step 2: 运行测试并观察失败**

Run: `npm test -- tests/deployment/config.test.ts`

Expected: FAIL because deployment files are missing.

- [ ] **Step 3: 实现本地与生产配置**

Document exact MySQL database/user grant, environment variables, migration, seed, backup, restore, SSH tunnel for raw DB access and normal business administration through the web admin page.

- [ ] **Step 4: 验证容器配置和文档命令**

Run: `docker compose config`

Expected: valid configuration with no unresolved required production secrets in demo profile.

- [ ] **Step 5: 运行部署测试并提交**

Run: `npm test -- tests/deployment/config.test.ts`

Expected: all deployment assertions pass.

Commit: `docs: add deployment and data administration workflow`

---

### Task 11: 端到端交互、视觉检查、CI 与发布门禁

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/modules.spec.ts`
- Create: `tests/e2e/permissions.spec.ts`
- Create: `tests/e2e/responsive.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`
- Create: `.github/workflows/db-migrate.yml`
- Modify: `README.md`
- Modify: `docs/README.md`

**Interfaces:**
- E2E uses demo/memory mode with deterministic seed identities: ordinary, super admin, sports lead and team captain.
- CI never deploys on pull requests; production deploy requires protected main and configured secrets.
- DB migration workflow requires explicit `RUN` confirmation.

- [ ] **Step 1: 写关键用户流程失败测试**

Cover login restoration/demo identity, every module navigation, ordinary user submissions, captain own-team check-in, captain cross-team denial, admin grant/revoke, module disable behavior and audit visibility.

- [ ] **Step 2: 运行 Playwright 并观察失败**

Run: `npx playwright test`

Expected: FAIL until complete frontend/API integration is wired.

- [ ] **Step 3: 修复集成并保持单元测试通过**

Wire web/API dev proxy, deterministic demo seeds, error boundaries and route fallbacks. Do not weaken permission assertions to make E2E pass.

- [ ] **Step 4: 运行全套门禁**

Run: `npm run check && npx playwright test`

Expected: lint, format, typecheck, unit/integration tests, build and all E2E tests pass.

- [ ] **Step 5: 逐页视觉检查**

Capture desktop 1440×1000, tablet 900×900 and mobile 390×844 screenshots for dashboard and representative form/table pages. Inspect every image for overflow, broken navigation, inaccessible dialogs, inconsistent spacing and visual mismatch; fix and rerun tests after any change.

- [ ] **Step 6: 验证生产构建与容器**

Run: `docker compose build && docker compose config`

Expected: API and web images build and compose remains valid.

- [ ] **Step 7: 提交发布门禁**

Commit: `ci: verify and deploy development platform`
