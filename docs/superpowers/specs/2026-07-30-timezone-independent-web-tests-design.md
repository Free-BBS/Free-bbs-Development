# Timezone-Independent Web Tests Design

## Context

The pull-request `verify` job runs on GitHub's UTC environment. Two web tests enter values into `datetime-local` controls but assert UTC strings that are only correct when the test process uses `Asia/Shanghai`.

The failures are deterministic:

- Event start input `2026-09-01T18:30` becomes `2026-09-01T18:30:00.000Z` in UTC, while the test expects `2026-09-01T10:30:00.000Z`.
- Role expiry input `2027-07-27T12:00` becomes `2027-07-27T12:00:00.000Z` in UTC, while the test expects `2027-07-27T04:00:00.000Z`.

The application behavior is correct: a `datetime-local` value represents wall-clock time in the user's local timezone and is converted to an instant before it is sent to the API.

## Scope

This change only makes the two affected test expectations independent of the operating-system timezone.

It does not:

- change production date parsing or API payload behavior;
- force GitHub Actions to use a particular timezone;
- introduce a product-wide timezone policy;
- modify any unrelated test or component.

## Design

Each affected test will keep its existing local datetime input in a named constant. The expected API value will be calculated in the test with:

```ts
new Date(localDateTime).toISOString();
```

This expresses the behavior under test directly: the API receives the UTC instant corresponding to the wall-clock value entered in the current runtime's local timezone.

The event test will compare the server-confirmed `startsAt` value with the calculated instant. The governance test will compare the role-assignment request body with the calculated expiry instant. Existing assertions for the rest of each workflow remain unchanged.

## Alternatives Rejected

- Setting `TZ=Asia/Shanghai` in CI would hide the environment dependency instead of removing it.
- Parsing every value as China Standard Time in production would change user-visible behavior and is outside this bug fix.

## Verification

1. Preserve the current UTC failure as the RED evidence.
2. Run both affected tests with `TZ=UTC`; all seven targeted tests must pass.
3. Run both affected tests with `TZ=Asia/Shanghai`; all seven targeted tests must pass.
4. Run the complete `npm run check` quality gate with a project-compatible Node version.
5. Push the fix to the existing pull-request branch and verify the GitHub `verify` check succeeds.
