# Clean Contracts CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every clean CI, release, and E2E environment build `@freebbs-development/contracts` before API or Web consumers resolve its exported `dist` files.

**Architecture:** Keep generated `dist` files ignored and avoid install lifecycle hooks because Docker runs `npm ci` before copying contracts source. Add one root `build:contracts` command, order root build/typecheck through it, and explicitly prepare contracts in isolated E2E jobs. Lock the ordering with workflow-policy tests.

**Tech Stack:** npm workspaces, TypeScript, Node test runner, GitHub Actions.

## Global Constraints

- Do not commit generated `dist` files.
- Do not add `prepare`, `postinstall`, or another install lifecycle build.
- Preserve PR-only CI as non-deploying.
- Preserve protected-main and environment gates in the production workflow.
- Do not merge the PR or deploy.

---

### Task 1: Add Failing Clean-Workspace Ordering Tests

**Files:**

- Modify: `tests/workflows/release-workflows.test.mjs`

**Interfaces:**

- Consumes: root `package.json`, `.github/workflows/ci.yml`, and `.github/workflows/deploy.yml`.
- Produces: regression assertions for ordered contracts builds before consumer typecheck/build and before Playwright in every isolated E2E job.

- [x] **Step 1: Add the failing assertions**

Read the root package JSON and assert:

```js
assert.equal(scripts['build:contracts'], 'npm run build -w @freebbs-development/contracts');
assert.match(scripts.build, /^npm run build:contracts && /);
assert.match(scripts.typecheck, /^npm run build:contracts && /);
assert.equal(scripts.prepare, undefined);
assert.equal(scripts.postinstall, undefined);
```

For both CI and production workflows, slice the `e2e-memory` and `e2e-production` jobs and assert:

```js
assert.match(job, /npm run build:contracts/);
assert.ok(job.indexOf('npm run build:contracts') < job.indexOf('npx playwright test'));
```

- [x] **Step 2: Run the workflow tests and verify RED**

Run:

```powershell
node --test tests/workflows/release-workflows.test.mjs
```

Expected: FAIL because `build:contracts` is undefined and E2E jobs do not prepare contracts.

### Task 2: Order Contracts Builds and Verify a Clean Environment

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/superpowers/plans/2026-07-30-clean-contracts-ci.md`

**Interfaces:**

- Produces: root script `build:contracts`.
- Produces: ordered root `build` and `typecheck` scripts.
- Produces: `npm run build:contracts` steps after `npm ci` in each isolated E2E job.

- [x] **Step 1: Implement the minimal script ordering**

Set the root scripts to:

```json
{
  "build:contracts": "npm run build -w @freebbs-development/contracts",
  "build": "npm run build:contracts && npm run build -w @freebbs-development/api && npm run build -w @freebbs-development/web",
  "typecheck": "npm run build:contracts && npm run typecheck -ws --if-present"
}
```

Add this step after `npm ci` in `e2e-memory` and `e2e-production` in both workflow files:

```yaml
- run: npm run build:contracts
```

- [x] **Step 2: Run the workflow tests and verify GREEN**

Run the Task 1 command again.

Expected: `4 passed`, `0 failed`.

- [x] **Step 3: Verify clean contracts resolution**

Move the ignored `packages/contracts/dist` directory to a validated temporary path, run:

```powershell
npm run typecheck
```

Expected: exit `0`, contracts `dist/index.d.ts` is regenerated before API and Web typechecking, and the temporary backup can be removed after path validation.

- [x] **Step 4: Run the complete quality gate**

Run:

```powershell
npm run check
```

Expected: exit `0`, including lint, formatting, workspace typechecks, 462 passing Vitest tests, operational/workflow tests, and production builds.

- [x] **Step 5: Commit and push**

```powershell
git add package.json .github/workflows/ci.yml .github/workflows/deploy.yml tests/workflows/release-workflows.test.mjs docs/superpowers/plans/2026-07-30-clean-contracts-ci.md
git commit -m "fix: build contracts before workspace consumers"
git push origin feature/development-platform-mvp
```

Expected: the PR automatically starts a fresh CI run; do not merge it.
