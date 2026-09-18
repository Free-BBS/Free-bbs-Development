# Final review fixes report

This report records the mandatory RED/GREEN evidence for the whole-branch review fixes.

## Cycle 1: registration and consultation ownership

RED: the focused Vitest run failed in five expected places: deadline registration resolved,
both concurrent registrations fulfilled, consultation create accepted requester `dueAt`, and the
activity UI exposed an enabled registration button with `未报名`. One cancellation setup failure
was traced to the test actor missing the distinct cancel permission and corrected before GREEN.

GREEN: 3 focused files passed, 16 tests total. A second RED run then failed because the triage
drawer had no `计划完成时间` field; the field is now serialized only through the handling endpoint.

## Cycle 2: liaison public contract and governance

RED: four focused liaison files produced six expected failures: public responses exposed recorder
metadata, board cards ignored API `teamCount`, no next-page control existed, permissions defaulted
to allow and did not require every ancestor scope, and legal maintenance transitions were absent.
The separate community UI RED failed on the missing author-edit control. Test-fixture defects
(missing audit query scope and a replaced allow-policy list) were corrected without production
changes.

GREEN: the affected module sweep passed 134 of 135 tests; the sole failure was an over-specific
fake-MySQL SQL assertion expecting an equality filter where the repository contract intentionally
uses its escaped search predicate. The assertion was narrowed to the actual invariant: registration
rows are selected on the transaction connection with `FOR UPDATE`.

The final affected-module rerun passed 30 test files and all 135 tests. Coverage includes the
public/privileged problem DTO boundary, exact post-author and team-maintainer governance, audit
events, all legal maintenance transitions, API-owned pagination metadata, and fail-closed ancestor
scope decisions for problem, team, and outcome actions.

## Cycle 3: repository compatibility and final verification

RED: the first repository-wide `npm run check` reached the complete Vitest suite and failed one of
651 tests. The legacy readability matrix still sent a valid requester-owned consultation `dueAt`
on create, so the newly strict API correctly returned 400 instead of the matrix's outdated 201.

GREEN: the compatibility case now exercises a legitimate requester title change and treats every
requester-supplied `dueAt`, including a syntactically valid instant, as invalid. Its focused rerun
passed all 13 tests. A fresh complete `npm run check` then passed lint, formatting, type checks,
141 Vitest files and 641 tests (one MySQL-only file / 10 tests skipped), 15 operational tests, four
workflow tests, and all production builds.

System-Chrome E2E passed all three cross-module specifications: events, information, and liaison.
The current environment has no `DATA_MODE=mysql` or MySQL connection variables, so the real MySQL
integration suite could not run. The memory concurrency tests and MySQL adapter `FOR UPDATE`
contract test did run and pass; the unavailable live adapter coverage is not represented as GREEN.

## Cycle 4: bounded team-count aggregation

RED: an initial contract fixture failed before reaching the intended assertion because its owner
subject was absent; after correcting only that fixture, the test failed with
`countActiveByProblemIds is not a function`. This was the valid implementation RED for replacing the
fixed-query but unbounded all-team scan.

GREEN: both stores now implement the same at-most-100-ID aggregate contract. Memory counts only
matching active records; MySQL executes one grouped query with bounded placeholders. The service
passes only IDs from the current problem page. The focused store/router/board run passed 20 tests.
The first subsequent full check exposed one old performance assertion that expected a transaction;
it was updated to assert the stronger contract: one page query, one page-ID aggregate query, and no
full team list. The combined focused rerun passed four files and all 41 tests.

Final GREEN after this refinement: a fresh `npm run check` passed lint, formatting, all type
checks, 141 Vitest files / 642 tests (the 10 live-MySQL tests remain environment-skipped), all 15
operational tests, all four workflow tests, and all production builds. The fresh system-Chrome run
again passed the events, information, and liaison E2E specifications (3/3).
