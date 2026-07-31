# Super-administrator-only governance entry

Date: 2026-07-30

## Goal

Make the governance administration entry and API strictly available only to users with the active `platform.super_admin` role. Users without that role must not see the entry and must return to the dashboard if they manually open `/development/admin`.

## Current-state findings

- Sidebar visibility currently relies on the mutable `admin.manage` permission.
- The dashboard currently renders all module cards without user-specific visibility filtering.
- The administration API accepts any authorization context that has `admin.manage`.
- The public main-site link already targets `/development/`, but the production path currently serves a static stub page. Deploying the Development application under the main-site Nginx path is separate from this authorization correction.

## Design

### Frontend visibility

- Add a shared `isSuperAdmin(user)` presentation helper based on the exact active role key `platform.super_admin`.
- Make `visibleModuleManifests` exclude the `admin` module unless `isSuperAdmin(user)` is true, even when a non-super-admin has an `admin.manage` policy.
- Build dashboard cards from the same user-aware visible module list so protected finance and governance entries are not leaked by the dashboard.

### Direct-route behavior

- Guard the `/admin` route with the exact-role helper.
- A signed-in non-super-admin who opens `/development/admin` is redirected with history replacement to `/development/dashboard`.
- Authentication loading, unauthenticated, and error states continue to be handled by the existing application shell.

### API boundary

- Replace the administration router’s generic `admin.manage` authorization check with an exact `platform.super_admin` role check.
- Return the existing structured 403 response for non-super-admin API requests.
- A mistakenly granted `admin.manage` policy does not bypass this role boundary.

## Scope limits

- Do not change role names, database schema, main-site login contracts, or production deployment.
- Do not remove `admin.manage` from the permission catalog because existing audit records and permission definitions may reference it.
- Do not change the capabilities of a valid super administrator.

## Verification

- Frontend tests cover sidebar visibility, dashboard visibility, and route redirection for a user that has `admin.manage` but lacks `platform.super_admin`.
- API tests prove the same policy-only user receives 403 and a super administrator retains access.
- Run focused Web/API tests, affected type checks, lint/format checks, and one real-browser identity-switch audit.
