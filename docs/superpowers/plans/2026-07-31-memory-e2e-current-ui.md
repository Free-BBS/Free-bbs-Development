# Memory E2E Current UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the memory-mode Playwright suite describe and verify the current approved Development portal, with only the separately user-authorized mobile section-containment CSS exception in production.

**Architecture:** Treat each stale E2E file as an independent executable-contract correction. Reuse small test-local identity helpers where the super-administrator route guard requires ordering, preserve all workflow and cleanup assertions, and add only `.module-page > section { min-width: 0; }` to contain the `/information` table at mobile widths. Then validate the five-file suite and the complete repository gate before pushing the existing pull-request branch.

**Tech Stack:** TypeScript, Playwright Test 1.61, React Router UI, PowerShell, Node.js 24 bundled runtime.

## Global Constraints

- Modify only `tests/e2e/clubs.spec.ts`, `tests/e2e/knowledge.spec.ts`, `tests/e2e/modules.spec.ts`, `tests/e2e/permissions.spec.ts`, `tests/e2e/responsive.spec.ts`, and the user-authorized `apps/web/src/styles/components.css` rule `.module-page > section { min-width: 0; }`.
- Do not change any other production code, APIs, schema, migrations, seeds, deployment, or dependencies.
- Preserve substantive membership, lifecycle, permission, audit, responsive-layout, error, and cleanup coverage.
- Dashboard remains the landing page and brand destination but is absent from module navigation.
- Knowledge public audience is `General`; interest groups use `趣缘群体` and `/interest-groups`.
- Only the exact super administrator may enter `/admin`; identity switching must finish before guarded navigation.
- Disabled modules are completely absent from navigation and dashboard cards.
- Do not add arbitrary sleeps.
- Run local Node commands with `C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` (Node 24.14, satisfying the repository floor `>=20.19.0`).
- Run browser tests with `PLAYWRIGHT_USE_SYSTEM_CHROME=true` and final repository verification with `TZ=UTC`.
- Do not merge or deploy.

## File Structure

- Modify `tests/e2e/clubs.spec.ts`: canonical interest-group page, copy, APIs, and lifecycle coverage.
- Modify `tests/e2e/knowledge.spec.ts`: public `General` audience and manager lifecycle coverage.
- Modify `tests/e2e/modules.spec.ts`: eight visible navigation destinations and safe super-admin entry.
- Modify `tests/e2e/permissions.spec.ts`: guarded admin setup and omission contract for disabled modules.
- Modify `tests/e2e/responsive.spec.ts`: dashboard-specific checks plus eight-module responsive navigation matrix.
- Modify `apps/web/src/styles/components.css`: only `.module-page > section { min-width: 0; }`, containing the 760px intrinsic `/information` table so it cannot widen its section to 776px in a 390px viewport.
- No new runtime helper or other production file is needed; helpers remain local to the test file that consumes them.

---

### Task 1: Align the interest-group workflow

**Files:**

- Modify: `tests/e2e/clubs.spec.ts`
- Test: `tests/e2e/clubs.spec.ts`

**Interfaces:**

- Consumes: Playwright `Page` and `APIRequestContext`; `/api/development/v1/interest-groups`.
- Produces: one E2E flow covering manager creation/editing, student membership, technical support, authorization denial, archive/restore, and persistence.

- [ ] **Step 1: Reproduce the stale expectation**

Run in PowerShell:

```powershell
$env:PLAYWRIGHT_USE_SYSTEM_CHROME = 'true'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\@playwright\test\cli.js' test tests/e2e/clubs.spec.ts
```

Expected: FAIL because the test opens the legacy `/clubs` route and expects `社群与俱乐部`.

- [ ] **Step 2: Update the canonical route and terminology**

Make these exact test-contract changes:

```ts
async function transition(request: APIRequestContext, id: string, to: string) {
  const response = await request.post(`${apiRoot}/interest-groups/${id}/transitions`, {
    headers: headers('demo-admin'),
    data: { to },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('interest groups cover membership, support, archive and restore flows', async ({
  page,
  request,
}, testInfo) => {
  // Existing workflow body remains in place.
});
```

In the workflow body, use the current UI contract:

```ts
const name = `E2E 趣缘群体 ${suffix}`;
await page.goto('./interest-groups');
await expect(page.getByRole('heading', { name: '趣缘群体', level: 2 })).toBeVisible();
await switchUser(page, 'demo-admin');
const create = page.getByRole('heading', { name: '创建趣缘群体草稿' }).locator('..');
// Keep the existing form interactions.
await expect(page.getByRole('status')).toHaveText('趣缘群体草稿已创建');
// Keep the existing edit interactions.
await expect(page.getByRole('status')).toHaveText('趣缘群体信息已保存');
```

Replace every API endpoint rooted at `${apiRoot}/clubs` in this file with the same suffix rooted at `${apiRoot}/interest-groups`, including list, memberships, technical support, and transitions. Keep response codes and payload assertions unchanged.

- [ ] **Step 3: Run the corrected workflow**

Run the Step 1 command again.

Expected: `1 passed`.

- [ ] **Step 4: Commit the interest-group correction**

```powershell
git add tests/e2e/clubs.spec.ts
git commit -m "test: align interest group e2e contract"
```

Expected: one commit containing only `tests/e2e/clubs.spec.ts`.

### Task 2: Align the knowledge audience heading

**Files:**

- Modify: `tests/e2e/knowledge.spec.ts`
- Test: `tests/e2e/knowledge.spec.ts`

**Interfaces:**

- Consumes: the public `General` audience and the existing administrator identity switcher.
- Produces: one E2E flow proving ordinary-reader restrictions and the complete manager lifecycle.

- [ ] **Step 1: Reproduce the stale heading**

Run:

```powershell
$env:PLAYWRIGHT_USE_SYSTEM_CHROME = 'true'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\@playwright\test\cli.js' test tests/e2e/knowledge.spec.ts
```

Expected: FAIL because `经验条目` is no longer the public section heading.

- [ ] **Step 2: Assert the approved public audience**

Replace only the initial heading assertion:

```ts
await page.goto('./knowledge');
await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
await expect(page.getByRole('heading', { name: '创建经验草稿' })).toHaveCount(0);

await switchUser(page, 'demo-admin');
```

Keep all draft, edit, reload, publish, student visibility, authorization denial, archive, invalid transition, and final persistence assertions unchanged.

- [ ] **Step 3: Run the corrected knowledge workflow**

Run the Step 1 command again.

Expected: `1 passed`.

- [ ] **Step 4: Commit the knowledge correction**

```powershell
git add tests/e2e/knowledge.spec.ts
git commit -m "test: align knowledge e2e audience"
```

Expected: one commit containing only `tests/e2e/knowledge.spec.ts`.

### Task 3: Align module navigation and guarded admin entry

**Files:**

- Modify: `tests/e2e/modules.spec.ts`
- Test: `tests/e2e/modules.spec.ts`

**Interfaces:**

- Consumes: module navigation rendered for `demo-admin`, which has the exact `platform.super_admin` role.
- Produces: `openAdmin(page: Page): Promise<void>` for test-local guarded navigation and coverage for all eight visible modules.

- [ ] **Step 1: Reproduce the stale navigation contract**

Run:

```powershell
$env:PLAYWRIGHT_USE_SYSTEM_CHROME = 'true'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\@playwright\test\cli.js' test tests/e2e/modules.spec.ts
```

Expected: FAIL because dashboard is absent from navigation and the old knowledge/club contracts are stale; the owner flow may also redirect when `/admin` is opened before switching identities.

- [ ] **Step 2: Define the current eight-module matrix**

Import `Page` and replace the matrix:

```ts
import { expect, test, type Page } from '@playwright/test';

const modules = [
  ['/knowledge', 'General'],
  ['/information', '公开信息'],
  ['/interest-groups', '趣缘群体'],
  ['/events', '活动'],
  ['/liaison', '联络资源'],
  ['/sports', '体育代表队'],
  ['/finance', '财务治理'],
  ['/admin', '治理管理台'],
] as const;
```

Keep the existing navigation loop. Its sidebar selector must remain:

```ts
const link = page.locator(`.sidebar .module-nav a[href="/development${route}"]`);
```

This makes absence of a dashboard navigation item part of the test because the expected list begins with knowledge.

- [ ] **Step 3: Add safe guarded navigation**

Add this helper after the module matrix:

```ts
async function openAdmin(page: Page) {
  await page.goto('./dashboard');
  await expect(page.locator('.user-card')).toContainText('demo-student');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
  await expect(page.locator('.user-card')).toContainText('demo-admin');
  await page.locator('.sidebar .module-nav a[href="/development/admin"]').click();
  await expect(page).toHaveURL(/\/development\/admin$/);
}
```

In the owner test, replace each block that opens `/admin` as a student and then switches identity with:

```ts
await openAdmin(page);
await page.getByRole('tab', { name: '模块与负责人' }).click();
```

Call `openAdmin(page)` again after the second owner replacement instead of reloading the guarded route. Preserve the `try`/`finally` owner restoration.

- [ ] **Step 4: Run all module workflows**

Run the Step 1 command again.

Expected: `3 passed`.

- [ ] **Step 5: Commit module navigation**

```powershell
git add tests/e2e/modules.spec.ts
git commit -m "test: align module navigation e2e"
```

Expected: one commit containing only `tests/e2e/modules.spec.ts`.

### Task 4: Align permission workflows with the super-admin boundary

**Files:**

- Modify: `tests/e2e/permissions.spec.ts`
- Test: `tests/e2e/permissions.spec.ts`

**Interfaces:**

- Consumes: `demo-admin` exact-role identity, super-admin-only `/admin`, and module-state administration API.
- Produces: `openAdmin(page: Page): Promise<void>` local setup plus coverage that disabled modules disappear and their APIs return `module_disabled`.

- [ ] **Step 1: Reproduce guarded-route and disabled-module failures**

Run:

```powershell
$env:PLAYWRIGHT_USE_SYSTEM_CHROME = 'true'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\@playwright\test\cli.js' test tests/e2e/permissions.spec.ts
```

Expected: three failures: guarded admin workflows redirect before the identity switch, and the disabled-module test expects obsolete disabled controls.

- [ ] **Step 2: Add one guarded-route helper**

Extend the import and add:

```ts
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function openAdmin(page: Page) {
  await page.goto('./dashboard');
  await expect(page.locator('.user-card')).toContainText('demo-student');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
  await expect(page.locator('.user-card')).toContainText('demo-admin');
  await page.locator('.sidebar .module-nav a[href="/development/admin"]').click();
  await expect(page).toHaveURL(/\/development\/admin$/);
}
```

In these three tests, replace `page.goto('./admin')` followed by `selectOption('demo-admin')` with `await openAdmin(page)`:

```ts
test('the administrator can grant and revoke a role with visible audit history', ...)
test('module disabling removes navigation and rejects the module API', ...)
test('governs subjects, expiring grants, binding replacement and audit filters', ...)
```

- [ ] **Step 3: Assert complete omission for a disabled module**

After navigating to the dashboard in the module-disabling test, use:

```ts
await page.goto('./dashboard');
await expect(page.locator('.sidebar a[href="/development/liaison"]')).toHaveCount(0);
await expect(page.getByTestId('dashboard-module-card').filter({ hasText: '联络资源' })).toHaveCount(
  0,
);
```

Delete the stale expectations for `.sidebar [aria-disabled="true"]` and a dashboard card with `aria-disabled="true"`. Keep the 503 response and `{ code: 'module_disabled' }` assertion, and keep `finally` re-enabling liaison.

- [ ] **Step 4: Run all permission workflows**

Run the Step 1 command again.

Expected: `4 passed`.

- [ ] **Step 5: Commit permission alignment**

```powershell
git add tests/e2e/permissions.spec.ts
git commit -m "test: align permission e2e navigation"
```

Expected: one commit containing only `tests/e2e/permissions.spec.ts`.

### Task 5: Align the responsive route matrix

**Files:**

- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `apps/web/src/styles/components.css` (only the authorized `.module-page > section { min-width: 0; }` rule)
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**

- Consumes: one dashboard load, desktop/sidebar or tablet/mobile navigation, and the current eight visible modules.
- Produces: responsive reachability, per-route no-overflow, long-text wrapping, font-link, dashboard-brand, and mobile-dialog coverage; the CSS rule contains the 760px `/information` table that otherwise expands its section to 776px at a 390px viewport.

- [ ] **Step 1: Reproduce the stale responsive matrix**

Run:

```powershell
$env:PLAYWRIGHT_USE_SYSTEM_CHROME = 'true'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\@playwright\test\cli.js' test tests/e2e/responsive.spec.ts
```

Expected: desktop, tablet, and mobile matrix tests fail on stale dashboard-navigation, knowledge, interest-group, or guarded-admin expectations.

- [ ] **Step 2: Define the eight navigable modules**

Change the comment to `Each matrix case performs one dashboard load and eight authenticated module transitions.` and replace `routes` with:

```ts
const routes: readonly {
  path: string;
  heading: string;
  primaryAction: (page: Page) => Locator;
}[] = [
  {
    path: 'knowledge',
    heading: 'General',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'information',
    heading: '公开信息',
    primaryAction: (page) => page.getByRole('button', { name: '提交咨询' }),
  },
  {
    path: 'interest-groups',
    heading: '趣缘群体',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'events',
    heading: '活动',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'liaison',
    heading: '联络资源',
    primaryAction: (page) => page.getByRole('button', { name: '创建资源' }),
  },
  {
    path: 'sports',
    heading: '体育代表队',
    primaryAction: (page) => page.getByRole('button', { name: '创建队伍草稿' }),
  },
  {
    path: 'finance',
    heading: '财务治理',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'admin',
    heading: '治理管理台',
    primaryAction: (page) => page.getByRole('button', { name: '筛选用户' }),
  },
] as const;
```

- [ ] **Step 3: Verify dashboard separately and navigate as super admin**

Replace each viewport matrix body with:

```ts
test(`${viewport.name} keeps the dashboard and all eight visible modules reachable`, async ({
  page,
}) => {
  test.setTimeout(responsiveMatrixTimeout);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('./dashboard');
  await expectMainSiteFontRequest(page);
  await expect(page.getByRole('heading', { name: '发展端工作台', exact: true })).toBeVisible();
  await expect(page.locator(`${viewport.navigation} a[href="/development/dashboard"]`)).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: 'FREE BBS' })).toHaveAttribute(
    'href',
    '/development/dashboard',
  );
  await expect(page.getByTestId('dashboard-module-card').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
  await expect(page.locator('.user-card')).toContainText('demo-admin');

  for (const route of routes) {
    const routeLink = page.locator(`${viewport.navigation} a[href="/development/${route.path}"]`);
    await routeLink.click();
    await expect(page).toHaveURL(new RegExp(`/development/${route.path}$`));
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: route.heading, exact: true }).first(),
    ).toBeVisible();

    const currentNavigation = page.locator(
      `${viewport.navigation} a[aria-current="page"][href="/development/${route.path}"]`,
    );
    await expect(currentNavigation).toBeVisible();
    await expect(currentNavigation).toBeInViewport();

    const primaryAction = route.primaryAction(page);
    await expect(primaryAction).toBeVisible();
    await primaryAction.scrollIntoViewIfNeeded();
    await expect(
      primaryAction,
      `${viewport.name}/${route.path} primary action should be reachable`,
    ).toBeInViewport();
    await expectNoHorizontalOverflow(page);

    if (route.path === 'sports') {
      await expectLongTextWraps(
        page.locator('.workbench-card code').first(),
        `SCOPE${'A'.repeat(512)}`,
      );
    }
    if (route.path === 'admin') {
      await expectLongTextWraps(
        page.locator('.record-card strong').first(),
        `UID${'9'.repeat(512)}`,
      );
    }
  }
});
```

Keep the separate mobile dialog test unchanged.

- [ ] **Step 4: Run responsive coverage**

Run the Step 1 command again.

Expected: `4 passed` (three viewport matrix cases and one mobile dialog case).

The retained per-route overflow assertion exposes the `/information` document overflow
(776px versus a 390px viewport). Add only this user-authorized rule to contain
the section without relaxing the assertion:

```css
.module-page > section {
  min-width: 0;
}
```

- [ ] **Step 5: Commit responsive alignment**

```powershell
git add tests/e2e/responsive.spec.ts
git commit -m "test: align responsive module matrix"
```

Expected: the first of two commits contains only `tests/e2e/responsive.spec.ts`.

- [ ] **Step 6: Commit the authorized responsive containment exception**

```powershell
git add apps/web/src/styles/components.css
git commit -m "fix: contain module sections on mobile"
```

Expected: the second commit contains only the authorized
`.module-page > section { min-width: 0; }` rule in `apps/web/src/styles/components.css`.

### Task 6: Verify, push, and confirm the pull request

**Files:**

- Verify: all five modified E2E files
- Verify: the authorized `apps/web/src/styles/components.css` containment rule
- Verify: complete repository
- Remote: `origin/feature/development-platform-mvp`

**Interfaces:**

- Consumes: all five corrected E2E contracts, the single authorized containment rule, and the existing pull-request branch.
- Produces: local passing evidence and four successful GitHub checks.

- [ ] **Step 1: Run the complete affected Playwright set**

```powershell
$env:PLAYWRIGHT_USE_SYSTEM_CHROME = 'true'
$env:TZ = 'UTC'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\@playwright\test\cli.js' test tests/e2e/clubs.spec.ts tests/e2e/knowledge.spec.ts tests/e2e/modules.spec.ts tests/e2e/permissions.spec.ts tests/e2e/responsive.spec.ts
```

Expected: `13 passed`.

- [ ] **Step 2: Run the complete repository quality gate**

```powershell
$env:TZ = 'UTC'
$env:Path = 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\22793\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\Node.js\node_modules\npm\bin\npm-cli.js' run check
```

Expected: lint, Prettier, workspace type checks, Vitest, operational tests, workflow tests, and builds all exit with code 0.

- [ ] **Step 3: Confirm scope and cleanliness**

```powershell
git diff origin/feature/development-platform-mvp...HEAD --name-only
git status --short --branch
```

Expected: this correction adds one design spec and one implementation plan, changes only the five approved E2E files plus the authorized `apps/web/src/styles/components.css` rule, and has two responsive commits (`test: align responsive module matrix` and `fix: contain module sections on mobile`); the worktree is clean.

- [ ] **Step 4: Push the pull-request branch**

```powershell
git push origin feature/development-platform-mvp
```

Expected: remote branch advances to the final local commit.

- [ ] **Step 5: Require all GitHub checks**

Inspect the newest workflow run for the pushed commit.

Expected:

```text
verify             success
mysql-integration  success
e2e-production     success
e2e-memory         success
```

Do not merge or deploy after these checks.
