# Dark-theme contrast and terminology correction

Date: 2026-07-30

## Goal

Correct the two contrast defects found during the rendered-page audit while preserving the approved FreeBBS main-site visual language, and remove the remaining legacy “club” wording from the administration entry.

## Scope

- In dark mode, render navigation SVG images in the light sidebar foreground color instead of their standalone black `currentColor` default.
- Keep the governance administration page dark, but replace its hard-coded light surfaces and dark text with theme-aware surfaces and foreground colors.
- Change the administration business entry from the legacy “社团” wording and compatibility route to “趣缘群体” and `/interest-groups`.

## Approach

The implementation will be CSS-first and narrowly scoped:

1. Add dark-theme rules for sidebar icon images.
2. Add dark-theme governance overrides for the page heading, tab navigation, definition hover state, secondary buttons, and statistic cards where existing hard-coded light values conflict with dark theme tokens.
3. Update only the stale business-entry label, description, and canonical route. The existing `/clubs` redirect remains available for old external links.

No component restructuring, new artwork, layout change, permission change, API change, or database migration is included.

## Verification

- Add a focused stylesheet regression test that fails while the dark-theme overrides are absent.
- Update the existing administration-page test to require the canonical “趣缘群体” entry.
- Run only the affected web tests, type checking, formatting/lint checks for changed files, and one real-browser screenshot audit in dark mode.
- Confirm the local preview remains available and the project worktree contains only the intended changes.
