# Task 10 implementation report

## Scope

Implemented the liaison problem community UI on top of the Task 9 API. The former contact-directory presentation is replaced by a restrained problem board and a four-part detail page. The wording borrows the “揭榜” metaphor, while the layout and interaction continue to use the development site's shared learning-area presentation components and theme tokens.

## TDD evidence

The first focused UI run failed all eight new cases for the expected missing-feature reasons: the page still rendered the legacy contact resource list, problem cards did not expose the required information, the detail route was a placeholder, and student, maintainer, and reviewer actions were absent.

After the initial GREEN cycle, a separate submit-for-review test was added. It failed because a maintainer could save a draft but could not explicitly submit it for review. The implementation then added the lifecycle action and retained the entered form state and recoverable error behavior.

The final focused suite passes 9 tests across the liaison board and detail page.

## Board and detail experience

- The problem board supports query and status filtering and shows source, lifecycle status, tags, deadline, concise expected outcome, and participating-team count on every card.
- Every problem opens a dedicated detail route with four stable sections: problem introduction, parallel teams, chronological progress discussion, and outcome versions.
- Discussion and progress entries are ordered from earliest to latest, leaving the newest update at the bottom.
- Ordinary students can browse, create or join a team, publish discussion or team progress, and submit a versioned outcome when they have an active team membership.
- Liaison maintainers with explicit create/update permissions can proxy-enter, edit, and submit problem drafts for review. Review controls appear on pending problems only when the current user has the explicit `liaison.problem.review` permission.
- Outcome maintainers can adopt submitted versions without changing the problem lifecycle state.

## Permissions, privacy, and resilience

- UI capabilities are derived from resolved policy actions. Super-admin identity is never used as a shortcut for review authority, and an exact deny overrides the baseline authenticated-student actions.
- Internal contact notes are absent from ordinary rendering and from ordinary test fixtures. The detail presentation additionally whitelists public problem fields before rendering, so an accidentally over-complete response cannot expose a private note.
- List, route, and user changes use request generations to ignore stale asynchronous responses. Loading states are explicit, route errors are recoverable, and failure messages avoid leaking raw implementation details.
- Problem creation and editing validate required fields, date ordering, tags, and public-contact data while preserving form input after a failed request.
- Team-count lookup failures degrade to an unavailable count without making the problem board unusable. The first page is deliberately bounded to 20 records for the current MVP.

## Verification

- Focused liaison UI: 2 files passed, 9 tests passed.
- Targeted liaison UI and API: 9 files passed, 46 tests passed.
- Full Vitest: 138 files passed and 1 environment-gated file skipped; 612 tests passed and 9 skipped.
- Type check: contracts, API, and web workspaces passed.
- Targeted ESLint and Prettier checks passed for every Task 10 TypeScript, TSX, CSS, and E2E file.
- Production build: contracts, API, and web passed; Vite transformed 88 modules.
- Liaison E2E with `PLAYWRIGHT_USE_SYSTEM_CHROME=true`: 1 test passed in 9.8 seconds. It covers proxy creation with a private note, editing, review submission, explicit reviewer approval, student-safe rendering, team creation, discussion posting, and public API privacy.
- `git diff --check` passed; only the repository's existing Windows line-ending conversion warnings were emitted.
