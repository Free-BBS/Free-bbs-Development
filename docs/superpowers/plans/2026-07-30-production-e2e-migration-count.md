# Production E2E Migration Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the stale production E2E migration-count expectation from six to seven without changing production behavior.

**Architecture:** Preserve the existing production-shape Playwright flow and system-status UI. Update only the expected applied-migration count so it matches the seven ordered migration files applied by the test database.

**Tech Stack:** Playwright, TypeScript, MySQL, GitHub Actions.

## Global Constraints

- Modify only `tests/e2e/admin.spec.ts` plus this implementation plan.
- Do not change migrations, seeds, database state, APIs, or UI code.
- Preserve the migration-count assertion.
- Do not merge the pull request or deploy.

---

### Task 1: Correct the Production Migration Count Expectation

**Files:**

- Modify: `tests/e2e/admin.spec.ts:150`
- Modify: `docs/superpowers/plans/2026-07-30-production-e2e-migration-count.md`

**Interfaces:**

- Consumes: the system-status panel value `appliedMigrationCount`, rendered from the production-shape MySQL database.
- Produces: a Playwright expectation matching the repository's seven ordered migrations.

- [x] **Step 1: Preserve RED evidence**

Use the existing failed GitHub job:

```text
production-shape 鈥?tests/e2e/admin.spec.ts:150
Expected substring: "6"
Received system status: 宸插簲鐢ㄨ縼绉?
```

Expected: the failure proves the stale assertion detects the current correct database state.

- [x] **Step 2: Apply the one-line test correction**

Replace:

```ts
await expect(statusPanel).toContainText('6');
```

with:

```ts
await expect(statusPanel).toContainText('7');
```

Do not modify surrounding E2E workflow steps.

- [x] **Step 3: Run the complete local quality gate**

Run with a project-compatible Node version:

```powershell
npm run check
```

Expected: exit `0`, including lint, formatting, typechecks, 462 passing unit tests, operational/workflow tests, and production builds.

- [x] **Step 4: Commit and push**

```powershell
git add tests/e2e/admin.spec.ts docs/superpowers/plans/2026-07-30-production-e2e-migration-count.md
git commit -m "test: align production e2e migration count"
git push origin feature/development-platform-mvp
```

Expected: the existing pull request starts a new CI run.

- [ ] **Step 5: Verify GitHub checks**

Require `verify`, `mysql-integration`, `e2e-memory`, and `e2e-production` to complete successfully. Do not merge or deploy.
