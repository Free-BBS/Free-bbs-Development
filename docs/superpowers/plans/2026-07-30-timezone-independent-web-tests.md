# Timezone-Independent Web Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two `datetime-local` web tests pass in UTC, Asia/Shanghai, and other runtime timezones without changing production behavior.

**Architecture:** Keep the application conversion unchanged. In each affected test, name the local wall-clock input and derive the expected API instant with the JavaScript `Date` conversion that defines the behavior being asserted.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Node.js.

## Global Constraints

- Modify only the two affected web test files plus this plan.
- Do not change production date parsing or API payload behavior.
- Do not force CI to use a specific timezone.
- Preserve every unrelated assertion in both workflow tests.
- Do not merge the pull request or deploy.

---

### Task 1: Remove Hard-Coded Timezone Assumptions

**Files:**

- Modify: `apps/web/src/modules/events/EventsPage.test.tsx`
- Modify: `apps/web/src/modules/admin/AdminPage.governance.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-30-timezone-independent-web-tests.md`

**Interfaces:**

- Consumes: HTML `datetime-local` values represented as `YYYY-MM-DDTHH:mm` strings.
- Produces: timezone-independent expectations for the ISO UTC instants sent to the API.

- [x] **Step 1: Verify the existing UTC failure (RED)**

Run with a project-compatible Node version and `TZ=UTC`:

```powershell
$env:TZ = 'UTC'
node node_modules/vitest/vitest.mjs run apps/web/src/modules/events/EventsPage.test.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx
```

Expected: `2 failed | 5 passed`; failures show the hard-coded values are eight hours earlier than the UTC runtime values.

- [x] **Step 2: Make the event expectation timezone-independent**

Inside the existing event workflow test, name the entered value and derive the expected instant:

```ts
const startsAtLocal = '2026-09-01T18:30';
```

Use the constant for input:

```ts
await user.type(startsAt, startsAtLocal);
```

Replace the fixed UTC assertion with:

```ts
expect(current.startsAt).toBe(new Date(startsAtLocal).toISOString());
```

- [x] **Step 3: Make the governance expectation timezone-independent**

Inside the existing governance grant test, name the entered value:

```ts
const expiryLocal = '2027-07-27T12:00';
```

Use it for both expiry inputs:

```ts
await userEvent.type(within(roleForm).getByLabelText('鍒版湡鏃堕棿'), expiryLocal);
await userEvent.type(within(tagForm).getByLabelText('Tag 鍒版湡鏃堕棿'), expiryLocal);
```

Replace the fixed role expiry in the expected request body with:

```ts
expiresAt: new Date(expiryLocal).toISOString(),
```

- [x] **Step 4: Verify GREEN in UTC**

Run the Step 1 command again.

Expected: `2 passed` test files and `7 passed` tests.

- [x] **Step 5: Verify GREEN in Asia/Shanghai**

Run:

```powershell
$env:TZ = 'Asia/Shanghai'
node node_modules/vitest/vitest.mjs run apps/web/src/modules/events/EventsPage.test.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx
```

Expected: `2 passed` test files and `7 passed` tests.

- [x] **Step 6: Run formatting and the complete quality gate**

Run:

```powershell
npm run check
```

Expected: exit `0`, including lint, formatting, workspace typechecks, all unit and operational tests, workflow-policy tests, and production builds.

- [x] **Step 7: Commit and push**

```powershell
git add apps/web/src/modules/events/EventsPage.test.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx docs/superpowers/plans/2026-07-30-timezone-independent-web-tests.md
git commit -m "test: make local datetime assertions timezone independent"
git push origin feature/development-platform-mvp
```

Expected: the existing pull request starts a new CI run; do not merge or deploy.
