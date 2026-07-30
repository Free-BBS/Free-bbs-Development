# Super Admin Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the governance entry and administration API available only to users whose active roles include `platform.super_admin`, while redirecting every other authenticated user from `/development/admin` to `/development/dashboard`.

**Architecture:** Add one shared presentation-layer exact-role predicate and reuse it for navigation, dashboard cards, and a focused React Router guard. Keep the API as the authorization authority by replacing its generic `admin.manage` policy decision with the same exact active-role boundary. Leave `admin.manage` in the permission catalog for legacy and audit references.

**Tech Stack:** TypeScript, React 18, React Router 6, Express 5, Vitest, Testing Library, Supertest.

## Global Constraints

- Only exact active role `platform.super_admin` may see or enter governance.
- A non-super-admin visiting `/development/admin` is redirected with history replacement to `/development/dashboard`.
- `/api/development/v1/admin/**` must reject policy-only `admin.manage` grants with the existing structured `403 forbidden` response.
- Keep `admin.manage` in the permission catalog.
- Do not change the database schema, main-site authentication contract, deployment configuration, or production environment.
- Preserve the current Chinese UI copy and main-site-aligned visual style.

---

### Task 1: Hide Governance From Non-Super-Admins

**Files:**

- Modify: `apps/web/src/core/permissions/Can.tsx`
- Modify: `apps/web/src/app/module-manifests.ts`
- Modify: `apps/web/src/app/AppShell.test.tsx`
- Modify: `apps/web/src/modules/dashboard/DashboardPage.tsx`
- Modify: `apps/web/src/modules/dashboard/DashboardPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**

- Produces: `isSuperAdmin(user: Pick<PresentationUser, 'roles'>): boolean`
- Consumes: `visibleModuleManifests(user, overrides)` from the module registry.
- Produces: `DashboardPageProps.user: PresentationUser`, supplied by `DashboardRoute`.

- [x] **Step 1: Add failing sidebar tests**

Extend `apps/web/src/app/AppShell.test.tsx` so a user with only an `admin.manage` policy still cannot see `权限与模块管理`, while a user with role `platform.super_admin` can:

```tsx
it('does not expose governance to a policy-only administrator', () => {
  mockUseAuth.mockReturnValue(
    authenticatedAuth({
      user: {
        ...user,
        policies: [
          { action: 'finance.*', effect: 'allow' },
          { action: 'admin.manage', effect: 'allow' },
        ],
      },
    }),
  );

  renderShell('/finance');

  const navigation = screen.getByRole('navigation', { name: '主要导航' });
  expect(navigation).toHaveTextContent('财务治理');
  expect(within(navigation).queryByText('权限与模块管理')).not.toBeInTheDocument();
});

it('exposes governance to a platform super administrator', () => {
  mockUseAuth.mockReturnValue(
    authenticatedAuth({ user: { ...user, roles: ['platform.super_admin'] } }),
  );

  renderShell('/admin');

  expect(
    within(screen.getByRole('navigation', { name: '主要导航' })).getByRole('link', {
      name: '权限与模块管理',
    }),
  ).toBeInTheDocument();
});
```

- [x] **Step 2: Add failing dashboard tests**

Replace the all-nine-cards expectation in `apps/web/src/modules/dashboard/DashboardPage.test.tsx` with two identity-aware cases. Pass a `PresentationUser` to `DashboardPage`; assert the policy-only user sees finance but not governance, and the super-admin sees governance:

```tsx
const policyOnlyUser: PresentationUser = {
  uid: 'policy-admin',
  displayName: '权限管理员',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
  policies: [
    { action: 'finance.record.read', effect: 'allow' },
    { action: 'admin.manage', effect: 'allow' },
  ],
};

expect(screen.queryByText('权限与模块管理')).not.toBeInTheDocument();

const superAdmin: PresentationUser = {
  ...policyOnlyUser,
  uid: 'super-admin',
  roles: ['platform.super_admin'],
  policies: [],
};

expect(await screen.findByText('权限与模块管理')).toBeInTheDocument();
```

- [x] **Step 3: Run the focused web tests and verify RED**

Run:

```powershell
node D:\Node.js\node_modules\npm\bin\npm-cli.js test -- --run apps/web/src/app/AppShell.test.tsx apps/web/src/modules/dashboard/DashboardPage.test.tsx
```

Expected: FAIL because `visibleModuleManifests` still accepts `admin.manage`, `DashboardPage` has no `user` prop, and its cards are not identity-filtered.

- [x] **Step 4: Implement the exact-role predicate and user-aware cards**

In `apps/web/src/core/permissions/Can.tsx`, export and reuse:

```tsx
export function isSuperAdmin(user: Pick<PresentationUser, 'roles'>): boolean {
  return user.roles.includes('platform.super_admin');
}
```

In `apps/web/src/app/module-manifests.ts`, import `isSuperAdmin` and add the exact-role condition before permission checks:

```tsx
(manifest.id !== 'admin' || isSuperAdmin(user)) &&
```

In `apps/web/src/modules/dashboard/DashboardPage.tsx`, require `user: PresentationUser`, convert the API response into `ModuleStateOverrides`, and derive cards with:

```tsx
const cards = useMemo(() => {
  const states = Object.fromEntries(
    modules.map((module) => [module.id, module.status]),
  ) as ModuleStateOverrides;
  return visibleModuleManifests(user, states);
}, [modules, user]);
```

In `apps/web/src/app/router.tsx`, pass the authenticated user to the page:

```tsx
return (
  <DashboardPage
    key={auth.demoUser ?? auth.user?.uid}
    client={auth.client}
    user={auth.user as PresentationUser}
  />
);
```

- [x] **Step 5: Run the focused web tests and verify GREEN**

Run the Step 3 command again.

Expected: PASS for both test files with no warnings or unhandled errors.

- [x] **Step 6: Commit the presentation boundary**

```powershell
git add apps/web/src/core/permissions/Can.tsx apps/web/src/app/module-manifests.ts apps/web/src/app/AppShell.test.tsx apps/web/src/modules/dashboard/DashboardPage.tsx apps/web/src/modules/dashboard/DashboardPage.test.tsx apps/web/src/app/router.tsx
git commit -m "fix: restrict governance entry to super admins"
```

### Task 2: Redirect Direct Admin Visits

**Files:**

- Create: `apps/web/src/core/permissions/SuperAdminRouteGuard.tsx`
- Create: `apps/web/src/core/permissions/SuperAdminRouteGuard.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**

- Consumes: `isSuperAdmin(user)` from Task 1.
- Produces: `SuperAdminRouteGuard({ user, children }): JSX.Element`, where `user` is `PresentationUser | null`.

- [x] **Step 1: Write the failing route-guard tests**

Create `apps/web/src/core/permissions/SuperAdminRouteGuard.test.tsx` with a memory router containing `/admin` and `/dashboard`. Have the dashboard marker render `useNavigationType()`, assert the policy-only user lands there through `REPLACE`, and assert a super-admin sees the protected child:

```tsx
function renderGuard(user: PresentationUser) {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <SuperAdminRouteGuard user={user}>
              <p>governance content</p>
            </SuperAdminRouteGuard>
          }
        />
        <Route path="/dashboard" element={<DashboardMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

it('redirects a policy-only administrator to the dashboard', () => {
  renderGuard(policyOnlyUser);
  expect(screen.getByText('dashboard content')).toBeInTheDocument();
  expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
  expect(screen.queryByText('governance content')).not.toBeInTheDocument();
});

it('renders governance for a super administrator', () => {
  renderGuard({ ...policyOnlyUser, roles: ['platform.super_admin'] });
  expect(screen.getByText('governance content')).toBeInTheDocument();
});
```

- [x] **Step 2: Run the guard test and verify RED**

Run:

```powershell
node D:\Node.js\node_modules\npm\bin\npm-cli.js test -- --run apps/web/src/core/permissions/SuperAdminRouteGuard.test.tsx
```

Expected: FAIL because `SuperAdminRouteGuard.tsx` does not exist.

- [x] **Step 3: Implement and connect the guard**

Create `apps/web/src/core/permissions/SuperAdminRouteGuard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { isSuperAdmin, type PresentationUser } from './Can.js';

export interface SuperAdminRouteGuardProps {
  children: ReactNode;
  user: PresentationUser | null;
}

export function SuperAdminRouteGuard({ children, user }: SuperAdminRouteGuardProps) {
  if (user === null || !isSuperAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
```

Wrap `AdminPage` in `apps/web/src/app/router.tsx`:

```tsx
return (
  <SuperAdminRouteGuard user={auth.user as PresentationUser | null}>
    <AdminPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />
  </SuperAdminRouteGuard>
);
```

- [x] **Step 4: Run the guard and navigation tests and verify GREEN**

Run:

```powershell
node D:\Node.js\node_modules\npm\bin\npm-cli.js test -- --run apps/web/src/core/permissions/SuperAdminRouteGuard.test.tsx apps/web/src/app/AppShell.test.tsx apps/web/src/modules/dashboard/DashboardPage.test.tsx
```

Expected: PASS with a policy-only user redirected and the super-admin allowed.

- [x] **Step 5: Commit the route guard**

```powershell
git add apps/web/src/core/permissions/SuperAdminRouteGuard.tsx apps/web/src/core/permissions/SuperAdminRouteGuard.test.tsx apps/web/src/app/router.tsx
git commit -m "fix: redirect unauthorized admin routes"
```

### Task 3: Enforce the Exact Role at the API Boundary

**Files:**

- Modify: `apps/api/src/modules/admin/router.test.ts`
- Modify: `apps/api/src/modules/admin/router.ts`

**Interfaces:**

- Consumes: `AuthenticationResult.user.roles`.
- Preserves: existing `{ data: { error: { code: 'forbidden', message } }, requestId }` response envelope.

- [x] **Step 1: Add a failing policy-only API test**

In `apps/api/src/modules/admin/router.test.ts`, mount `createAdminRouter` on a small Express app with an injected authenticator returning a non-super-admin context that includes an allow policy for `admin.manage`:

```tsx
function policyOnlyAdminApp() {
  const store = createMemoryStore();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/development/v1/admin',
    createAdminRouter({
      store,
      authenticate: async () => ({
        status: 200,
        user: {
          uid: 'policy-admin',
          displayName: 'Policy Admin',
          avatarUrl: null,
          baseRole: 'student',
          roles: [],
          tags: [],
          policies: [
            {
              id: 'policy-admin-manage',
              action: 'admin.manage',
              resource: 'admin',
              effect: 'allow',
              scope: { type: 'public', id: '*' },
            },
          ],
        },
      }),
      version: 'test',
      dataMode: 'memory',
      getAppliedMigrationCount: async () => 0,
    }),
  );
  return app;
}

it('rejects a policy-only admin.manage grant', async () => {
  const response = await request(policyOnlyAdminApp())
    .get('/api/development/v1/admin/modules')
    .expect(403);
  expect(response.body).toMatchObject({
    data: { error: { code: 'forbidden' } },
  });
});
```

- [x] **Step 2: Run the focused API test and verify RED**

Run:

```powershell
node D:\Node.js\node_modules\npm\bin\npm-cli.js test -- --run apps/api/src/modules/admin/router.test.ts
```

Expected: FAIL because the current generic `authorize(...admin.manage...)` decision admits the injected policy.

- [x] **Step 3: Replace the mutable policy gate with the exact role check**

In `apps/api/src/modules/admin/router.ts`, remove the `authorize` import and replace its decision with:

```tsx
if (!result.user.roles.includes('platform.super_admin')) {
  response.status(403).json({
    data: {
      error: { code: 'forbidden', message: 'Super administrator role is required' },
    },
    requestId: response.locals.requestId as string,
  });
  return;
}
```

Do not alter the permission catalog.

- [x] **Step 4: Run the API and full verification suites**

Run:

```powershell
node D:\Node.js\node_modules\npm\bin\npm-cli.js test -- --run apps/api/src/modules/admin/router.test.ts
node D:\Node.js\node_modules\npm\bin\npm-cli.js run typecheck
node D:\Node.js\node_modules\npm\bin\npm-cli.js run lint
node D:\Node.js\node_modules\npm\bin\npm-cli.js run format:check
node D:\Node.js\node_modules\npm\bin\npm-cli.js test
node D:\Node.js\node_modules\npm\bin\npm-cli.js run build
```

Expected: all commands exit `0`; the admin API tests include the policy-only denial and the existing super-admin success cases.

- [x] **Step 5: Commit the API boundary**

```powershell
git add apps/api/src/modules/admin/router.test.ts apps/api/src/modules/admin/router.ts
git commit -m "fix: enforce super admin governance boundary"
```

### Task 4: Browser Audit and Documentation Closeout

**Files:**

- Modify: `docs/superpowers/plans/2026-07-30-super-admin-entry.md`

**Interfaces:**

- Consumes: running local web preview at `http://localhost:5173/development/`.
- Produces: checked plan steps and a clean feature branch.

- [x] **Step 1: Audit the policy-only user in a real browser**

Open `http://localhost:5173/development/admin` using a non-super-admin demo identity. Verify the final URL is `http://localhost:5173/development/dashboard`, and verify neither the sidebar nor dashboard contains `权限与模块管理`.

- [x] **Step 2: Audit the super-admin in a real browser**

Switch to the super-admin demo identity, open `http://localhost:5173/development/admin`, and verify the governance page loads and its navigation entry is visible.

- [x] **Step 3: Record completion and verify the branch**

Mark completed checkboxes in this plan, then run:

```powershell
git status --short --branch
git log -4 --oneline
```

Expected: the branch is `feature/development-platform-mvp`; only the plan checkbox update may remain before its final documentation commit.

- [x] **Step 4: Commit plan completion**

```powershell
git add docs/superpowers/plans/2026-07-30-super-admin-entry.md
git commit -m "docs: record super admin boundary verification"
```

## Verification Record

- Focused Web tests: `14 passed` across the route guard, application shell, and dashboard suites.
- Focused API tests: `5 passed`, including policy-only `admin.manage` denial and existing super-admin success cases.
- TypeScript: all API, Web, and contracts workspaces passed.
- ESLint: passed with exit code `0`.
- Full Vitest suite: `462 passed`, `5 skipped`, no failures.
- Production build: API, Web, and contracts builds passed; Vite produced the production assets successfully.
- Browser audit:
  - `demo-student` entered `/development/admin`, landed on `/development/dashboard`, and saw zero governance entries.
  - `demo-admin` saw one governance navigation entry and opened `/development/admin`.
- Formatting:
  - Every file changed by this implementation passes Prettier.
  - The full repository `format:check` still reports two pre-existing Markdown files outside this change:
    `docs/superpowers/plans/2026-07-30-dark-theme-contrast.md` and
    `docs/superpowers/specs/2026-07-30-dark-theme-contrast-design.md`.
- Integration choice: preserve `feature/development-platform-mvp` and its linked worktree; do not merge, push, create a PR, deploy, or clean up.
