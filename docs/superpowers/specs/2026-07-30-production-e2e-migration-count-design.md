# Production E2E Migration Count Design

## Context

The production-shape end-to-end test opens the governance system-status panel and checks that MySQL is active and the expected number of migrations has been applied.

The repository contains seven ordered migrations, `001_core.sql` through `007_platform_content_update.sql`. The production-shape database correctly reports seven applied migrations, but `tests/e2e/admin.spec.ts` still expects the stale value `6`.

## Scope

This fix only updates the production E2E expectation from `6` to `7`.

It does not:

- change a migration or database state;
- change the system-status API or UI;
- remove migration-count coverage;
- change memory-mode E2E behavior;
- merge the pull request or deploy.

## Design

Keep the existing system-status workflow and replace:

```ts
await expect(statusPanel).toContainText('6');
```

with:

```ts
await expect(statusPanel).toContainText('7');
```

The existing failed GitHub production E2E run is the RED evidence. After the one-line test correction, run the full local quality gate, push to the current pull-request branch, and require the new GitHub production E2E run to pass.
