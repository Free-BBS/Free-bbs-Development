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

## Review remediation

The Task 10 review identified an incomplete existing-team join experience, missing editor and service schedule checks, stale navigation expectations, and an over-emphasized action hierarchy. Each runtime change was introduced through a focused RED/GREEN cycle.

### RED evidence

The remediation RED run recorded 12 expected failures across the focused API and UI suites:

- applicants could submit a membership request but could not see their own pending membership after refresh;
- team maintainers had no visible pending-member queue or confirmation control;
- inverted problem schedules were accepted by both the request boundary and service;
- the editor accepted inverted dates, more than 20 tags, and tags longer than 64 characters;
- deadline cards omitted the local time;
- review failures were announced through the success status region;
- create feedback could outlive the request generation that produced it;
- secondary actions still used the primary visual treatment;
- the dashboard retained the legacy liaison-module description.

A separate RED test then established the applicant's confirmed `已加入团队` state. A further RED test established a generation-safe success announcement for a recovered board refresh.

### Remediation

- Team projections now include a pending membership only for that applicant or the team's maintainer. Unrelated users still see active members only, preserving pending-applicant privacy and the existing generic not-found behavior of protected mutations.
- Applying to an existing team updates the local read model immediately and survives refresh. The applicant sees `申请待确认`; the maintainer sees a compact pending-member list and can confirm; both the API and UI then expose the active closed-loop state.
- Problem create and patch schemas reject an explicitly inverted schedule. The service validates the final merged schedule as well, so a one-field patch cannot move the start beyond an existing deadline or vice versa. Rejected service updates remain transactional.
- The problem editor validates chronological order, a maximum of 20 tags, and a maximum length of 64 characters per tag before submission, with specific Chinese messages.
- Local date formatting now includes both date and time.
- Review errors use an alert separate from successful status feedback and leave controls available for retry. Starting any new action clears stale success feedback.
- Board create and manual refresh success messages are emitted only by the still-current request generation.
- `参与课题` remains the only primary header action. Viewing, proxy entry, filtering, editing, review submission, decisions, retries, existing-team applications, and confirmations use a secondary treatment.
- The web module manifest and navigation/responsive E2E expectations now describe the real-problem collaboration module and account for the information module's announcements redirect and current action labels.
- The responsive probe follows the current sports card DOM and verifies block as well as inline wrapping. Shared cards now inherit `overflow-wrap: anywhere`, preventing unbroken identifiers from being clipped on mobile.

### Remediation verification

- Focused liaison UI/API and dashboard suite: 7 files passed, 51 tests passed.
- Full Vitest: 139 files passed and 1 environment-gated file skipped; 624 tests passed and 9 skipped.
- Type check: contracts, API, and web workspaces passed.
- Changed-file ESLint and Prettier checks passed.
- Production build: contracts, API, and web passed; Vite transformed 88 modules.
- Liaison, module-navigation, and responsive E2E with `PLAYWRIGHT_USE_SYSTEM_CHROME=true`: all 8 tests passed in 31.1 seconds.
- `git diff --check` passed; only Windows line-ending conversion warnings were emitted.

## Final confirmation-boundary remediation

A final review found that the pending-member list was correctly scoped to the team maintainer, but its confirmation control did not also honor the problem lifecycle and the resolved `liaison.problem.join` permission.

The RED run added two UI behavior classes and failed three cases as expected: an explicit join deny on an open problem, plus paused and closed problems, all still rendered the confirmation button. The detail view now renders that button only when the problem is open, the resolved join capability is allowed, and the current user is the team's maintainer. Pending applicants remain visible as read-only context to their maintainer when any of those action conditions is false. The API authorization and service behavior were not changed.

Final verification:

- Focused liaison UI/API and dashboard suite: 7 files passed, 54 tests passed.
- Full Vitest: 139 files passed and 1 environment-gated file skipped; 627 tests passed and 9 skipped.
- Type checks passed for contracts, API, and web.
- Changed-file ESLint and Prettier checks passed.
- Production build passed for contracts, API, and web; Vite transformed 88 modules.
- Liaison E2E with `PLAYWRIGHT_USE_SYSTEM_CHROME=true`: 1 test passed in 10.8 seconds.
