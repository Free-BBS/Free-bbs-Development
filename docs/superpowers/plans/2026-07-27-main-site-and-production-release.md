# Main Site and Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 闭环主站入口与登录回跳，交付真实 MySQL readiness、可安装且可回滚的服务器发布程序，并用生产形态 CI/E2E 证明发布包可上线。

**Architecture:** 发展端保持同源 Token 与 API 内省模型，新增深层路径 return target、回环监听和独立 `/ready`。发布归档携带 commit SHA，root-owned hook 在版本目录与静态目录间原子切换并以 readiness 为门禁；主站最后合并入口和安全 `returnTo`，确保入口不会先于发展端可用。

**Tech Stack:** Node.js 22 production runtime、TypeScript、Express、MySQL 8.4、Bash、Nginx、systemd、GitHub Actions、Playwright。

## Global Constraints

- 发展端必须先完成核心治理和业务交互两份计划，再执行最终发布门禁。
- 主站 token key 固定 `free_bbs_auth_token`；发展端不得建立第二套账号体系。
- `/health` 仅代表进程存活；`/ready` 必须真实验证 MySQL、迁移文件名和 SHA-256 checksum。
- 生产 API 默认监听 `127.0.0.1:3100`，3100 和 3306 不暴露公网。
- 发布程序必须校验 40 位 SHA、归档内部 `.release-sha`、路径安全，并在任一步失败时恢复上一版本。
- 发布程序不得自动运行 demo seed，不得输出环境文件、Token、SSH key 或数据库密码。
- 主站 `returnTo` 只允许同源绝对路径，拒绝 `//`、反斜杠跨源变体和绝对 URL。
- 主站入口只能在发展端生产 `/development/`、`/ready` 和回滚演练通过后发布。
- 所有新增行为 TDD；每个仓库独立提交、独立测试。

---

### Task 1: 发展端深层登录回跳与共享 Token 契约

**Repository:** `E:\BBSDeveleopment\Free-bbs-Development\.worktrees\platform-mvp`

**Files:**
- Modify: `apps/web/src/core/auth/AuthProvider.tsx`
- Modify: `apps/web/src/core/auth/AuthProvider.test.tsx`
- Modify: `apps/web/src/core/api/client.test.ts`
- Modify: `apps/api/src/core/auth/auth-middleware.test.ts`
- Modify: `apps/api/src/core/auth/review-auth-regressions.test.ts`

**Interfaces:**

```ts
export interface ReturnLocation { pathname: string; search: string; hash: string }
export function mainSiteLoginHref(location?: ReturnLocation): string;
```

- [ ] **Step 1: 写失败测试**

```ts
expect(mainSiteLoginHref({
  pathname: '/development/events', search: '?filter=pending', hash: '#record-x',
})).toBe('/login?returnTo=%2Fdevelopment%2Fevents%3Ffilter%3Dpending%23record-x');
expect(mainSiteLoginHref({ pathname: '//evil.example', search: '', hash: '' }))
  .toBe('/login?returnTo=%2Fdevelopment%2F');
```

Also assert `AUTH_TOKEN_STORAGE_KEY` remains `free_bbs_auth_token`, main mode forwards only opaque Bearer, and coarse main-site role never grants development permissions.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/web/src/core/auth/AuthProvider.test.tsx apps/web/src/core/api/client.test.ts apps/api/src/core/auth/auth-middleware.test.ts`

Expected: deep return path assertion FAIL because the href is fixed to `/development/`.

- [ ] **Step 3: 实现安全发展端 location 编码**

Default to `window.location`; accept only pathname equal to `/development` or beginning `/development/`; concatenate search/hash and encode once. Invalid/non-development values fail closed to `/development/`.

- [ ] **Step 4: 运行 GREEN**

Run: same command as Step 2.

Expected: all shared login and auth regression tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/web/src/core/auth apps/web/src/core/api/client.test.ts apps/api/src/core/auth
git commit -m "feat: preserve development login return path"
```

---

### Task 2: API 回环监听、liveness 与 MySQL readiness

**Repository:** development worktree.

**Files:**
- Create: `apps/api/src/config/env.test.ts`
- Create: `apps/api/src/core/database/mysql-readiness.ts`
- Create: `apps/api/src/core/database/mysql-readiness.test.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/core/database/create-store.ts`
- Modify: `deploy/systemd/freebbs-development-api.service`

**Interfaces:**

```ts
export type ReadinessCheck = () => Promise<void>;
export interface StoreHandle {
  mode: DataMode;
  store: DevelopmentStore;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}
export async function checkMySqlReadiness(pool: Pool, migrationsDirectory?: string): Promise<void>;
```

- [ ] **Step 1: 写失败测试**

Assert `HOST` defaults to `127.0.0.1`, invalid hosts/ports reject, server passes host to `listen`, `/health` remains 200 without calling readiness, and `/ready` returns 200 only after `SELECT 1` plus exact migration checksum comparison; any DB/migration error returns 503 `not_ready` without SQL detail.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/config/env.test.ts apps/api/src/app.test.ts apps/api/src/core/database/mysql-readiness.test.ts`

Expected: FAIL because host and readiness interfaces/routes are missing.

- [ ] **Step 3: 实现 readiness**

Load repository migration files using the same splitter/checksum rules as `migrate.mjs`; reject missing, extra or mismatched applied migrations. Memory mode readiness resolves immediately. `server.listen(environment.port, environment.host)` and systemd sets `HOST=127.0.0.1` through the environment file.

- [ ] **Step 4: 运行 GREEN**

Run: same command as Step 2 plus `npm run typecheck -w @freebbs-development/api`.

Expected: tests and typecheck PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api deploy/systemd/freebbs-development-api.service
git commit -m "feat: add production readiness and loopback binding"
```

---

### Task 3: 真实 MySQL 8 约束与 CI

**Files:**
- Create: `database/migrations/006_domain_reference_integrity.sql`
- Create: `apps/api/src/core/database/mysql.integration.test.ts`
- Create: `.dockerignore`
- Modify: `apps/api/src/core/database/migration-smoke.test.ts`
- Modify: `package.json`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/deployment/config.test.ts`

**Interface:** root script `"test:mysql": "npm run db:migrate && npm run db:migrate && vitest run apps/api/src/core/database/mysql.integration.test.ts"`.

- [ ] **Step 1: 写失败集成和配置测试**

Test empty migration, repeated migration, CRUD round-trip, UTC date/time, integer cents, unique memberships/registrations/check-ins, FK rejection for orphan club/activity/team/finance references, and readiness. Static test asserts CI has `mysql:8.4` service and runs `test:mysql`.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/core/database/migration-smoke.test.ts tests/deployment/config.test.ts`

Expected: FAIL because migration 006, test:mysql, CI service and dockerignore assertions are absent.

- [ ] **Step 3: 实现 migration 006 与 CI job**

Before each FK, use a `SIGNAL SQLSTATE '45000'` guard for orphan rows; never delete or synthesize data. CI test credentials are fixed non-secret values scoped to the job. `.dockerignore` excludes `.git`, `.env*` except examples, node_modules, dist inputs rebuilt in image, test output and local worktrees.

- [ ] **Step 4: 运行 GREEN**

Run on a machine with Docker:

```powershell
docker compose --profile mysql up -d database
$env:DATA_MODE='mysql'; $env:MYSQL_HOST='127.0.0.1'; $env:MYSQL_PORT='3306'
$env:MYSQL_DATABASE='free_bbs_development'; $env:MYSQL_USER='freebbs_development'
$env:MYSQL_PASSWORD='test-only-password'; npm run test:mysql
docker compose --profile mysql down
```

Expected: two migrations, CRUD/FK/readiness tests PASS; database is not exposed publicly.

- [ ] **Step 5: 提交**

```powershell
git add database/migrations/006_domain_reference_integrity.sql apps/api/src/core/database/mysql.integration.test.ts .dockerignore package.json docker-compose.yml .github/workflows/ci.yml tests/deployment/config.test.ts
git commit -m "ci: verify real mysql integration"
```

---

### Task 4: 可复现发布归档、安装器与原子回滚 hook

**Files:**
- Create: `scripts/create-release-archive.sh`
- Create: `scripts/deploy-release.sh`
- Create: `scripts/install-server.sh`
- Create: `deploy/env/development.env.example`
- Create: `deploy/systemd/freebbs-development-backup.service`
- Create: `deploy/systemd/freebbs-development-backup.timer`
- Create: `tests/scripts/deploy-release.test.mjs`
- Create: `tests/fixtures/nginx/nginx.conf`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/db-migrate.yml`
- Modify: `tests/scripts/operational-scripts.test.mjs`
- Modify: `tests/workflows/release-workflows.test.mjs`
- Modify: `tests/deployment/config.test.ts`
- Modify: `deploy/nginx/freebbs-development.locations.conf`
- Modify: `deploy/systemd/freebbs-development-api.service`
- Modify: `deploy/systemd/freebbs-development-web.service`

**CLI:**

```text
scripts/create-release-archive.sh --sha 0123456789abcdef0123456789abcdef01234567 --output /tmp/freebbs-development.tar.gz
scripts/deploy-release.sh --archive /tmp/freebbs-development.tar.gz --sha 0123456789abcdef0123456789abcdef01234567
sudo scripts/install-server.sh
```

- [ ] **Step 1: 写失败测试**

Cover bad SHA, `.release-sha` mismatch, absolute/`..`/control-character entries, escaping symlink, successful atomic switch, failure at install/build/nginx/restart/readiness and rollback to prior API/static version. Inject sentinel secrets and assert no captured stdout/stderr contains them.

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/scripts/deploy-release.test.mjs tests/scripts/operational-scripts.test.mjs && npm run test:workflows`

Expected: FAIL because scripts and updated workflow are missing.

- [ ] **Step 3: 实现安装与发布**

Archive generator writes `.release-sha` before tar and includes the lockfile, workspace manifests, TypeScript/Vite configuration, `apps/*/src`, `apps/web/index.html`, `packages/contracts/src`, migrations, deployment assets and scripts required to build the exact commit; CI may prebuild for verification, but the server never depends on an omitted source tree. Installer creates `freebbs-development` user/group, `/opt/freebbs-development/releases`, `/etc/freebbs-development`, installs root-owned 0755 hook, Nginx snippet, systemd units and non-overwriting 0640 env template; it does not start without a release/env. Deploy extracts into `<sha>.staging`, runs locked dependency install and production builds, atomically swaps `/opt/freebbs-development/current` plus `/usr/share/nginx/html/development` to the new release's `apps/web/dist`, validates Nginx, restarts/reloads, polls `/ready`, then verifies `/development/`; trap restores both prior symlinks and services.

- [ ] **Step 4: 运行 GREEN**

```bash
node --test tests/scripts/deploy-release.test.mjs tests/scripts/operational-scripts.test.mjs
npm run test:workflows
npx vitest run tests/deployment/config.test.ts
nginx -t -p "$PWD/tests/fixtures/nginx" -c nginx.conf
systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer
```

Expected: every check exits 0 on Linux CI.

- [ ] **Step 5: 提交**

```powershell
git add scripts deploy .github/workflows tests
git commit -m "feat: add auditable atomic server deployment"
```

---

### Task 5: 生产数据、发布和回滚文档

**Files:**
- Create: `docs/production-release-checklist.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/server-deployment.md`
- Modify: `docs/data-administration.md`
- Modify: `docs/local-development.md`

- [ ] **Step 1: 写文档契约失败测试**

Extend `tests/deployment/config.test.ts` and `tests/scripts/operational-scripts.test.mjs` to require exact documented commands for install, env permissions, three MySQL accounts, migration, bootstrap, backup checksum, encrypted off-host copy, restore drill, release, smoke test and rollback.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run tests/deployment/config.test.ts && node --test tests/scripts/operational-scripts.test.mjs`

Expected: FAIL because production checklist and hook install steps are absent.

- [ ] **Step 3: 编写无凭据 runbook**

Use explicit variables `FREEBBS_DOMAIN`, `FIRST_SUPER_ADMIN_UID`, `RELEASE_SHA` only as operator inputs and show where each comes from. Include GitHub `production`/`production-database` environments, protected main, server-local migration or self-hosted private runner, Adminer loopback+SSH tunnel, backup timer/retention configuration, recovery confirmation and rollback compatibility warning.

- [ ] **Step 4: 运行 GREEN**

Run: same command as Step 2 plus `npx prettier docs README.md --check`.

Expected: tests and formatting PASS.

- [ ] **Step 5: 提交**

```powershell
git add README.md docs tests/deployment/config.test.ts tests/scripts/operational-scripts.test.mjs
git commit -m "docs: add production release and data runbook"
```

---

### Task 6: 主站安全 returnTo 与 canonical 发展端入口

**Repository:** `E:\BBSDeveleopment\freebbs-web`, branch `deploy-development-entry`.

**Files:**
- Create: `public/return-to.js`
- Create: `scripts/return-to.test.js`
- Modify: `public/login.html`
- Modify: `public/auth.js`
- Modify: `public/app.js`
- Modify: `public/development.html`
- Modify: `server.js`
- Modify: `scripts/development-navigation.test.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`

**Interfaces:**

```js
sanitizeReturnTo(value, origin = window.location.origin) => string
readReturnTo(search = window.location.search, origin = window.location.origin) => string
```

- [ ] **Step 1: 写开放重定向与入口失败测试**

Accept `/development/sports?team=a#today`; reject empty, absolute URL, `//evil`, `/\\evil`, malformed encoding and origin mismatch to `/`. Assert navigation uses `/development/` immediately before Settings, `/development` redirects 308, and `/development.html` canonicalizes to `/development/`.

- [ ] **Step 2: 运行 RED**

Run: `node --test scripts/return-to.test.js scripts/development-navigation.test.js`

Expected: FAIL because helper is missing, login always jumps `/`, and entry lacks canonical slash.

- [ ] **Step 3: 实现浏览器/Node 双出口 helper**

Load `/return-to.js` before `auth.js`. Login success uses `window.location.assign(window.FreeBBSReturnTo.readReturnTo())`; registration/reset still use `/`. The local development page clearly says the integrated React app is supplied by host Nginx and links to repository setup; it is not presented as production content.

- [ ] **Step 4: 运行 GREEN**

Run: `npm test && npm run check`

Expected: all main-site tests/lint/format PASS.

- [ ] **Step 5: 提交**

```powershell
git add public server.js scripts package.json README.md DEPLOYMENT.md
git commit -m "feat: complete development entry login return"
```

Do not merge or deploy this main-site commit until Task 7 proves the development endpoint is production-ready.

---

### Task 7: 生产形态发布门禁与真实入口验收

**Repositories:** development first, then main site.

**Files:**
- Create: `tests/e2e/admin.spec.ts`
- Create: `tests/e2e/release-smoke.spec.ts`
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/permissions.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 写生产形态失败测试**

Start MySQL 8, migrate, seed demo only in CI, run API with `DATA_MODE=mysql`, and Web with main-auth contract stub. Test main-site token → `/api/auth/me` → subject sync → deep return path, full seven-section Admin mutations, `/ready`, static `/development/`, invalid token 401 and database outage readiness 503.

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/e2e/admin.spec.ts tests/e2e/release-smoke.spec.ts tests/e2e/auth.spec.ts`

Expected: FAIL until MySQL webServer setup, readiness and main-auth stub are wired.

- [ ] **Step 3: 完成 CI/release gate**

Keep demo/memory fast suite, add separate MySQL/main-auth production-shape project and artifact reports. Release workflow must require verify + MySQL + Playwright jobs and upload the exact archive created by `create-release-archive.sh` before SSH secrets are exposed.

- [ ] **Step 4: 全量 GREEN**

```powershell
npm run check
npx playwright test
npm audit
npm audit --omit=dev
docker compose config
docker compose build
```

Expected: all commands exit 0; browser reports and release archive are preserved.

- [ ] **Step 5: 提交并按顺序发布**

```powershell
git add tests/e2e playwright.config.ts .github/workflows
git commit -m "ci: gate complete production release"
```

Deployment order: backup → migration → bootstrap if first release → development deploy → `/health`, `/ready`, `/development/`, permission and rollback smoke → merge/deploy main-site entry → real login/deep-return smoke.
