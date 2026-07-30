# Memory E2E Alignment with the Current UI

Date: 2026-07-30

## Goal

Restore the memory-mode end-to-end check by aligning its stale UI expectations with
the current, approved Development portal behavior. This is a test-only correction:
the product UI, routes, authorization, APIs, and data model remain unchanged.

## Current-state findings

The failed GitHub Actions run reports ten failures across five test files. The
application behavior matches the approved product design, while these tests still
encode earlier names, routes, navigation rules, and authorization flows:

- the dashboard remains the landing page but is intentionally absent from the
  sidebar;
- the knowledge page's public section is named `General`, not `经验条目`;
- clubs are now named `趣缘群体` and use the canonical `/interest-groups` UI and
  API paths;
- the governance entry is visible only to the exact super administrator, and an
  unauthorized direct visit redirects to the dashboard;
- disabled modules are omitted from navigation and dashboard presentation rather
  than rendered as disabled controls.

## Chosen approach

Update only the five stale E2E specifications. Do not introduce compatibility
markup or weaken route guards merely to satisfy obsolete selectors.

This approach keeps the tests as executable documentation for the approved
product behavior and avoids adding dead UI states. The rejected alternatives are:

1. Restore old routes, headings, and disabled cards in production. This would
   reverse approved interface decisions.
2. Skip or broadly relax the failing tests. This would lose meaningful workflow,
   permission, responsive-layout, and API coverage.

## File-level design

### `tests/e2e/clubs.spec.ts`

- Open `/interest-groups`.
- Expect the `趣缘群体` and `创建趣缘群体草稿` labels.
- Use the canonical `/interest-groups` API prefix for list, membership,
  technical-support, and lifecycle requests.
- Preserve the existing membership, support, archive, restore, and illegal
  transition assertions.

### `tests/e2e/knowledge.spec.ts`

- Expect the public `General` section when an ordinary student enters the page.
- Preserve the assertion that an ordinary student cannot see maintenance controls.
- Switch to the administrator identity before exercising the existing draft,
  edit, publish, archive, restore, and illegal transition workflow.

### `tests/e2e/modules.spec.ts`

- Remove the dashboard from the expected sidebar links.
- Update the knowledge and interest-group route/name expectations.
- Cover the eight currently visible modules for the administrator:
  knowledge, information, interest groups, events, liaison resources, sports
  teams, finance governance, and governance administration.
- Switch to the super-administrator identity on an accessible page before opening
  `/admin`, so the direct-route guard is exercised correctly rather than bypassed.
- Preserve module-owner mutation and restoration coverage.

### `tests/e2e/permissions.spec.ts`

- For every governance UI workflow, switch to the super-administrator identity on
  the dashboard before opening `/admin`.
- When a module is disabled, assert that its navigation entry and dashboard card
  are absent.
- Preserve the API assertion that the disabled module returns the structured
  `module_disabled` response.
- Preserve role assignment, tag assignment, permission replacement, audit, and
  cleanup coverage.

### `tests/e2e/responsive.spec.ts`

- Replace the old nine-route sidebar matrix with the current eight visible
  administrator modules.
- Test the dashboard separately as the landing page and brand destination because
  it is intentionally not a sidebar item.
- Update knowledge and interest-group paths, headings, and action selectors.
- Switch to the super-administrator identity before navigating to the guarded
  administration route.
- Preserve desktop, tablet, and mobile layout checks.

## Error handling and cleanup
