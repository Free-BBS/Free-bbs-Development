# Development Platform Content, Permissions, and UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved organization permissions, content modules, CSV roster import, finance isolation, and main-site-aligned visual update without opening a pull request or deploying.

**Architecture:** Keep the existing React/Vite and Express service boundaries. Extend authorization through a central social-organization catalog, persist new domain records through the existing repository abstraction, and enforce every organization scope in services before presenting the same policy in React. One additive migration carries all schema changes so MySQL and memory modes expose the same contract.

**Tech Stack:** TypeScript, React 18, React Router, Express 5, Zod, MySQL 8, Vitest, Testing Library, Supertest, CSS.

## Global Constraints

- Keep `/dashboard` as the default route but omit it from desktop and mobile navigation.
- Model exactly seven built-in social-work organizations: 文艺中心、联络中心、体育中心、权益发展中心、团委、科协、TMS.
- Allow one active level per organization and different levels across multiple organizations.
- Treat 主席 as the same authorization level as 负责人.
- Keep `sports.team_captain` independent from social-organization authority.
- Keep old data and `/clubs` compatible; do not delete existing business records.
- Use the main-site theme key `free_bbs_theme_mode`.
- Sports import accepts CSV with exact headers `姓名,学号`.
- Do not create a pull request or deploy during this plan.

---

### Task 1: Social-Organization Authorization Foundation

**Files:**
- Create: `packages/contracts/src/organizations.ts`
- Create: `packages/contracts/src/organizations.test.ts`
- Create: `apps/api/src/core/organizations/catalog.ts`
- Create: `apps/api/src/core/organizations/catalog.test.ts`
- Create: `apps/api/src/modules/admin/organization-membership-service.ts`
- Create: `apps/api/src/modules/admin/organization-membership-service.test.ts`
- Create: `apps/api/src/modules/admin/organization-memberships-router.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/modules.ts`
- Modify: `apps/api/src/core/bootstrap/built-in-definitions.ts`
- Modify: `apps/api/src/core/authorization/permission-catalog.ts`
- Modify: `apps/api/src/modules/admin/router.ts`
- Modify: `apps/api/src/modules/admin/assignment-service.ts`

**Interfaces:**
- Produces: `SocialOrganizationId`, `OrganizationLevel`, `SOCIAL_ORGANIZATIONS`, `organizationForRole(roleKey)`.
- Produces: `setOrganizationMembership(store, { subjectUid, organizationId, level }, context)`.
- Produces: `DELETE /admin/organization-memberships/:subjectUid/:organizationId`.
- Consumes: existing role/tag assignment repositories and audit service.

- [ ] **Step 1: Write failing catalog and synchronization tests**

```ts
expect(SOCIAL_ORGANIZATIONS.map(({ id }) => id)).toEqual([
  'arts_center',
  'liaison_center',
  'sports_center',
  'rights_development_center',
  'tuanwei',
  'sast',
  'tms',
]);

await setOrganizationMembership(store, {
  subjectUid: 'multi-org-user',
  organizationId: 'sports_center',
  level: 'director',
}, { actorUid: 'demo-admin' });
await setOrganizationMembership(store, {
  subjectUid: 'multi-org-user',
  organizationId: 'tms',
  level: 'member',
}, { actorUid: 'demo-admin' });

expect(activeRoles('multi-org-user')).toEqual(
  expect.arrayContaining(['department.sports_director', 'affiliation.tms_member']),
);
expect(activeTags('multi-org-user')).toEqual(
  expect.arrayContaining(['social_org.sports_center', 'social_org.tms']),
);
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- packages/contracts/src/organizations.test.ts apps/api/src/core/organizations/catalog.test.ts apps/api/src/modules/admin/organization-membership-service.test.ts`

Expected: FAIL because the organization contract and membership service do not exist.

- [ ] **Step 3: Add the organization contract and role mapping**

```ts
export const SOCIAL_ORGANIZATION_IDS = [
  'arts_center',
  'liaison_center',
  'sports_center',
  'rights_development_center',
  'tuanwei',
  'sast',
  'tms',
] as const;

export type SocialOrganizationId = (typeof SOCIAL_ORGANIZATION_IDS)[number];
export type OrganizationLevel = 'member' | 'director' | 'lead';

export interface SocialOrganizationDefinition {
  id: SocialOrganizationId;
  name: string;
  tagKey: `social_org.${SocialOrganizationId}`;
  roles: Readonly<Record<OrganizationLevel, RoleKey>>;
}
```

Extend `ROLE_KEYS` with Tuanwei and SAST director/lead roles and all three TMS roles. Export one immutable catalog that maps every organization, Tag, and level role.

- [ ] **Step 4: Implement transactional membership replacement**

```ts
export async function setOrganizationMembership(
  store: DevelopmentStore,
  input: OrganizationMembershipInput,
  context: AssignmentMutationContext,
): Promise<OrganizationMembershipView> {
  return store.transaction(async (tx) => {
    const definition = organizationById(input.organizationId);
    await archiveOtherOrganizationLevels(tx, input.subjectUid, definition, input.level, context);
    const role = await ensureRoleAssignment(tx, input.subjectUid, definition.roles[input.level], context);
    const tag = await ensureTagAssignment(tx, input.subjectUid, definition.tagKey, context);
    await recordMembershipAudit(tx, input, context, role);
    return { organizationId: input.organizationId, level: input.level, role, tag };
  });
}
```

Route generic organization-role grants through this service so direct admin role assignment cannot produce an unsynchronized built-in organization Tag.

- [ ] **Step 5: Bootstrap built-in roles, Tags, and permissions**

Add the seven built-in Tag definitions. Add organization-level role rules for knowledge, proposal maintenance, Interest Groups, events, sports, and finance exactly as consumed by later tasks. Keep captain permissions unchanged.

- [ ] **Step 6: Verify GREEN and regression coverage**

Run: `npm test -- packages/contracts/src/organizations.test.ts apps/api/src/core/organizations apps/api/src/modules/admin`

Expected: PASS with one active level per organization, preserved cross-organization assignments, synchronized Tags, and audited changes.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src apps/api/src/core/organizations apps/api/src/core/bootstrap apps/api/src/core/authorization apps/api/src/modules/admin
git commit -m "feat: add social organization membership authority"
```

### Task 2: Additive Business Schema and Store Contract

**Files:**
- Create: `database/migrations/007_platform_content_update.sql`
- Create: `apps/api/src/core/database/platform-content-schema.test.ts`
- Modify: `apps/api/src/core/database/types.ts`
- Modify: `apps/api/src/core/database/memory-store.ts`
- Modify: `apps/api/src/core/database/mysql-store.ts`
- Modify: `apps/api/src/core/database/business-workflow-store-contract.test.ts`
- Modify: `apps/api/src/core/database/mysql.integration.test.ts`

**Interfaces:**
- Produces: `ProposalRecord`, `ActivityMilestoneRecord`, `CompetitionFixtureRecord`.
- Extends: `KnowledgeEntryRecord`, `ClubRecord`, `ActivityRecord`, `FinanceRecord`.
- Produces repositories: `proposals`, `activityMilestones`, `competitionFixtures`.
- Consumes: generic `RecordRepository<T>`.

- [ ] **Step 1: Write failing store-contract and migration tests**

```ts
const proposal = await store.proposals.create({
  title: '延长场馆开放时间',
  problemDescription: '晚间场地不足',
  proposedSolution: '试行延长开放一小时',
  category: 'campus_service',
  submitterUid: 'demo-student',
  assigneeUid: null,
  publicProgress: '已提交',
  internalNote: '',
  status: 'submitted',
  ownerUid: 'demo-student',
  scope: { type: 'public', id: '*' },
});
expect((await store.proposals.get(proposal.id))?.status).toBe('submitted');
```

Assert that migration `007` creates `proposals`, `activity_milestones`, and `competition_fixtures`, and adds organization/audience fields without destructive DDL.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- apps/api/src/core/database/platform-content-schema.test.ts apps/api/src/core/database/business-workflow-store-contract.test.ts`

Expected: FAIL because new repositories and fields are absent.

- [ ] **Step 3: Extend record interfaces**

```ts
export interface ProposalRecord extends StoredRecord {
  title: string;
  problemDescription: string;
  proposedSolution: string;
  category: string;
  submitterUid: string;
  assigneeUid: string | null;
  publicProgress: string;
  internalNote: string;
}

export interface ActivityMilestoneRecord extends StoredRecord {
  activityId: string;
  occursAt: string;
  title: string;
  type: string;
  description: string;
  completed: boolean;
  displayOrder: number;
}
```

Add `audience` and `organizationId` to knowledge, `organizationId` to clubs, activity timing/location/organization fields, fixture fields, and finance organization/reviewer fields.

- [ ] **Step 4: Add one forward-only migration**

Use nullable transitional columns and deterministic defaults:

```sql
ALTER TABLE knowledge_entries
  ADD COLUMN audience ENUM('general', 'social_org') NOT NULL DEFAULT 'general',
  ADD COLUMN organization_id VARCHAR(64) NULL;

CREATE TABLE proposals (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  problem_description TEXT NOT NULL,
  proposed_solution TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  submitter_uid VARCHAR(128) NOT NULL,
  assignee_uid VARCHAR(128) NULL,
  public_progress TEXT NOT NULL,
  internal_note TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  scope_type VARCHAR(64) NOT NULL,
  scope_id VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);
```

The same migration creates milestone and fixture tables and adds the approved club, activity, and finance fields.

- [ ] **Step 5: Wire memory and MySQL repositories**

Add state arrays, searchable fields, MySQL row codecs, definitions, and `DevelopmentStore` repository properties for every new record.

- [ ] **Step 6: Verify GREEN including MySQL codec tests**

Run: `npm test -- apps/api/src/core/database/platform-content-schema.test.ts apps/api/src/core/database/business-workflow-store-contract.test.ts apps/api/src/core/database/mysql-store.test.ts`

Expected: PASS in memory mode and through mocked MySQL row encoding.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/007_platform_content_update.sql apps/api/src/core/database
git commit -m "feat: extend platform business data schema"
```

### Task 3: Permission-Aware Shell and Main-Site Theme

**Files:**
- Create: `apps/web/src/core/theme/useMainSiteTheme.ts`
- Create: `apps/web/src/core/theme/useMainSiteTheme.test.tsx`
- Modify: `apps/web/src/app/AppShell.tsx`
- Modify: `apps/web/src/app/AppShell.test.tsx`
- Modify: `apps/web/src/app/module-manifests.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/shell.css`
- Modify: `apps/web/src/styles/components.css`
- Add binary asset: `apps/web/src/assets/freebbs-emblem-v2.png` copied from `freebbs-web/public/assets/freebbs-emblem-v2.png`

**Interfaces:**
- Produces: `useMainSiteTheme()` returning `{ mode, toggle }`.
- Produces: `visibleModuleManifests(user, moduleStates)`.
- Consumes: `/me` policies already included in `AuthorizationContext`.

- [ ] **Step 1: Write failing navigation and theme tests**

```tsx
expect(screen.queryByRole('link', { name: /工作台/ })).not.toBeInTheDocument();
expect(screen.getByRole('link', { name: /FREE BBS/ })).toHaveAttribute('href', '/dashboard');
expect(screen.queryByRole('link', { name: /财务治理/ })).not.toBeInTheDocument();

localStorage.setItem('free_bbs_theme_mode', 'light');
renderHook(() => useMainSiteTheme());
expect(document.body).toHaveClass('theme-light');
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- apps/web/src/app/AppShell.test.tsx apps/web/src/core/theme/useMainSiteTheme.test.tsx`

Expected: FAIL because dashboard is currently listed and no shared theme hook exists.

- [ ] **Step 3: Filter module navigation**

```ts
export function visibleModuleManifests(
  user: PresentationUser,
  states?: ModuleStateOverrides,
): readonly ModuleManifest[] {
  return MODULE_MANIFESTS.filter((module) => {
    if (module.id === 'dashboard') return false;
    if (resolveModuleStatus(module, states) !== 'enabled') return false;
    return module.requiredPermissions.every((permission) =>
      hasPresentationPermission(user, permission),
    );
  });
}
```

Keep `/dashboard` as the index redirect and wildcard fallback. Change the brand target to `/dashboard`.

- [ ] **Step 4: Share the main-site theme**

```ts
const THEME_STORAGE_KEY = 'free_bbs_theme_mode';
const initial = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
document.body.classList.toggle('theme-light', mode === 'light');
document.body.classList.toggle('theme-dark', mode === 'dark');
```

Add the theme control to the title bar and reuse main-site token values, sidebar dimensions, focus states, and responsive bottom navigation behavior.

- [ ] **Step 5: Rename Interest Groups and preserve the old route**

Change UI copy and manifest route to `/interest-groups`. Route `/clubs` to `<Navigate to="/interest-groups" replace />`.

- [ ] **Step 6: Verify GREEN and responsive shell tests**

Run: `npm test -- apps/web/src/app apps/web/src/core/theme`

Expected: PASS for hidden dashboard navigation, permission-filtered modules, legacy redirect, and theme persistence.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app apps/web/src/core/theme apps/web/src/styles apps/web/src/assets/freebbs-emblem-v2.png
git commit -m "feat: align development shell with main site"
```

### Task 4: Split the Knowledge Base by Audience

**Files:**
- Modify: `apps/api/src/modules/knowledge/service.ts`
- Modify: `apps/api/src/modules/knowledge/router.ts`
- Modify: `apps/api/src/modules/knowledge/router.test.ts`
- Modify: `apps/api/src/modules/knowledge/scope-regression.test.ts`
- Modify: `apps/web/src/modules/knowledge/KnowledgePage.tsx`
- Modify: `apps/web/src/modules/knowledge/KnowledgePage.test.tsx`

**Interfaces:**
- Produces: `GET /knowledge/entries?audience=general|social_org`.
- Consumes: `organizationForRole`, organization Tags, `KnowledgeEntryRecord.audience`.

- [ ] **Step 1: Write failing API isolation tests**

```ts
const ordinary = await student.get('/api/development/v1/knowledge/entries?audience=social_org');
expect(ordinary.status).toBe(403);

const member = await artsMember.get('/api/development/v1/knowledge/entries?audience=social_org');
expect(member.body.data.map((entry: { organizationId: string }) => entry.organizationId))
  .toContain('arts_center');
```

Add tests for own-organization draft editing, director publishing, and lead cross-organization management.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- apps/api/src/modules/knowledge apps/web/src/modules/knowledge/KnowledgePage.test.tsx`

Expected: FAIL because audience fields and entry-point visibility are not implemented.

- [ ] **Step 3: Enforce audience and organization scope in the service**

```ts
if (input.audience === 'social_org' && input.organizationId === null) {
  throw new HttpError(400, 'organization_required', 'Social organization entry requires an organization');
}
if (input.audience === 'social_org' && !canCreateForOrganization(actor, input.organizationId)) {
  throw knowledgeNotFound();
}
```

Filter protected records before returning lists or direct record responses.

- [ ] **Step 4: Build the two-entry web view**

Render General for everyone. Render 社工组织 only when the user has a `social_org.*` Tag. Keep the protected panel unmounted for ordinary students.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- apps/api/src/modules/knowledge apps/web/src/modules/knowledge`

Expected: PASS for API concealment, role levels, and hidden social-organization UI.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/knowledge apps/web/src/modules/knowledge
git commit -m "feat: separate public and organization knowledge"
```

### Task 5: Add the Transparent Proposal Pool

**Files:**
- Modify: `apps/api/src/modules/information/service.ts`
- Modify: `apps/api/src/modules/information/router.ts`
- Create: `apps/api/src/modules/information/proposals.test.ts`
- Modify: `apps/web/src/modules/information/InformationPage.tsx`
- Modify: `apps/web/src/modules/information/InformationPage.test.tsx`

**Interfaces:**
- Produces: `GET/POST /information/proposals`.
- Produces: `GET/PATCH /information/proposals/:proposalId`.
- Public response excludes `internalNote`.
- Maintenance response includes `internalNote` for Rights Development roles.

- [ ] **Step 1: Write failing public/private response tests**

```ts
const submitted = await student.post('/api/development/v1/information/proposals').send({
  title: '增加夜间自习空间',
  problemDescription: '考试周座位不足',
  proposedSolution: '延长公共教室开放时间',
  category: 'campus_service',
});
expect(submitted.status).toBe(201);
expect(submitted.body.data).not.toHaveProperty('internalNote');

const maintained = await rightsMember.patch(
  `/api/development/v1/information/proposals/${submitted.body.data.id}`,
).send({ status: 'reviewing', publicProgress: '已进入调研', internalNote: '联系物业' });
expect(maintained.status).toBe(200);
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- apps/api/src/modules/information/proposals.test.ts apps/web/src/modules/information/InformationPage.test.tsx`

Expected: FAIL because proposal routes and UI are absent.

- [ ] **Step 3: Implement proposal schemas, service, and audit**

Use the approved six-state workflow. Separate `toPublicProposal(record)` from maintenance serialization so internal notes never leak through a shared object spread.

- [ ] **Step 4: Add list, detail, submission, and maintenance UI**

Provide a public table/detail view and a permission-gated editor for category, status, assignee, public progress, and internal note.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- apps/api/src/modules/information apps/web/src/modules/information`

Expected: PASS for public visibility, ordinary submission, Rights Development maintenance, and internal-note protection.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/information apps/web/src/modules/information
git commit -m "feat: add transparent proposal pool"
```

### Task 6: Rename and Reassign Interest Groups

**Files:**
- Modify: `apps/api/src/modules/clubs/manifest.ts`
- Modify: `apps/api/src/modules/clubs/service.ts`
- Modify: `apps/api/src/modules/clubs/router.ts`
- Modify: `apps/api/src/modules/clubs/router.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/modules/clubs/ClubsPage.tsx`
- Modify: `apps/web/src/modules/clubs/ClubsPage.test.tsx`

**Interfaces:**
- Produces canonical `/interest-groups` API mounting.
- Preserves `/clubs` as an API alias.
- Consumes Liaison Center organization roles for create/update permission.

- [ ] **Step 1: Write failing alias and authorization tests**

```ts
expect((await student.get('/api/development/v1/interest-groups')).status).toBe(200);
expect((await liaisonMember.post('/api/development/v1/interest-groups').send(group)).status)
  .toBe(201);
expect((await sportsMember.post('/api/development/v1/interest-groups').send(group)).status)
  .toBe(403);
expect((await student.get('/api/development/v1/clubs')).body.data)
  .toEqual((await student.get('/api/development/v1/interest-groups')).body.data);
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- apps/api/src/modules/clubs apps/web/src/modules/clubs`

Expected: FAIL for missing canonical route and old Arts-based maintenance authority.

- [ ] **Step 3: Mount one router at both API paths and update policy**

Mount the same `createClubsRouter` instance factory at `/interest-groups` and `/clubs`. Change permission rules to Liaison Center member/director/lead while preserving public read/join/leave.

- [ ] **Step 4: Update UI copy and associated activity links**

Use “趣缘群体” throughout headings, empty states, dialogs, and detail labels. Display associated public activities from the events API.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- apps/api/src/modules/clubs apps/web/src/modules/clubs apps/api/src/app.test.ts`

Expected: PASS for public use, Liaison maintenance, and compatibility paths.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/clubs apps/api/src/app.ts apps/web/src/modules/clubs
git commit -m "feat: turn clubs into interest groups"
```

### Task 7: Add Activity Detail, Timeline, and Competition Preview

**Files:**
- Modify: `apps/api/src/modules/events/service.ts`
- Modify: `apps/api/src/modules/events/router.ts`
- Modify: `apps/api/src/modules/events/router.test.ts`
- Create: `apps/api/src/modules/events/timeline.test.ts`
- Modify: `apps/web/src/modules/events/EventsPage.tsx`
- Modify: `apps/web/src/modules/events/EventsPage.test.tsx`
- Create: `apps/web/src/modules/events/ActivityDetailPage.tsx`
- Create: `apps/web/src/modules/events/ActivityDetailPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Produces: `GET /events/activities/:activityId`.
- Produces: milestone CRUD under `/events/activities/:activityId/milestones`.
- Produces: fixture CRUD under `/events/activities/:activityId/fixtures`.
- Produces web route `/events/:activityId`.

- [ ] **Step 1: Write failing service and detail-page tests**

```ts
const detail = await student.get(`/api/development/v1/events/activities/${activityId}`);
expect(detail.body.data).toMatchObject({
  location: '东大操场',
  progress: { completed: 2, total: 4, percentage: 50 },
});
expect(detail.body.data.fixtures[0]).toMatchObject({
  round: '小组赛',
  participantA: '电子系',
  participantB: '自动化系',
});
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- apps/api/src/modules/events apps/web/src/modules/events`

Expected: FAIL because detail aggregation, milestones, fixtures, and detail route are absent.

- [ ] **Step 3: Extend activity validation and organization ownership**

Require organization-scoped creation for social-organization users. Members create drafts for their own organization; directors and leads publish and maintain their own organization.

- [ ] **Step 4: Implement milestone and fixture services**

Calculate progress without storing a percentage:

```ts
const completed = milestones.filter((item) => item.completed).length;
const progress = milestones.length === 0
  ? null
  : { completed, total: milestones.length, percentage: Math.round(completed / milestones.length * 100) };
```

Keep milestone and fixture writes in the parent activity’s organization scope and audit each mutation.

- [ ] **Step 5: Build cards and the detail route**

Cards display time, location, description, and organizer. The detail page renders a keyboard-operable timeline, progress bar, registration controls, and optional competition fixtures.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- apps/api/src/modules/events apps/web/src/modules/events apps/web/src/app`

Expected: PASS for public detail visibility, organization-scoped editing, timeline progress, fixture previews, and registration.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/events apps/web/src/modules/events apps/web/src/app/router.tsx
git commit -m "feat: add activity timelines and competition previews"
```

### Task 8: Add Sports Team CSV Roster Import

**Files:**
- Create: `apps/api/src/modules/sports/csv-roster.ts`
- Create: `apps/api/src/modules/sports/csv-roster.test.ts`
- Create: `apps/api/src/modules/sports/roster-import.test.ts`
- Modify: `apps/api/src/modules/sports/service.ts`
- Modify: `apps/api/src/modules/sports/router.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/modules/sports/SportsPage.tsx`
- Modify: `apps/web/src/modules/sports/SportsPage.test.tsx`

**Interfaces:**
- Produces: `parseRosterCsv(csv: string): RosterPreviewRow[]`.
- Produces: `POST /sports/teams/:teamId/roster-import/preview` with `text/csv`.
- Produces: `POST /sports/teams/:teamId/roster-import` with normalized preview rows.

- [ ] **Step 1: Write failing CSV parser tests**

```ts
expect(parseRosterCsv('\uFEFF姓名,学号\r\n张三,20260001')).toEqual([
  { row: 2, name: '张三', studentNumber: '20260001', outcome: 'ready' },
]);
expect(() => parseRosterCsv('学号,姓名\n20260001,张三')).toThrow(RosterCsvError);
expect(parseRosterCsv('姓名,学号\n张三,20260001\n张三,20260001')[1]?.outcome)
  .toBe('duplicate_in_file');
```

- [ ] **Step 2: Confirm parser RED**

Run: `npm test -- apps/api/src/modules/sports/csv-roster.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement bounded server-side CSV parsing**

Support BOM, CRLF/LF, quoted commas, and escaped quotes. Reject files above 256 KiB, headers other than the exact two-column order, and rows with extra columns.

- [ ] **Step 4: Write failing preview, authorization, and rollback tests**

Assert name mismatch blocking, existing-team skip, pending-subject creation, captain rejection, Sports director success, and complete rollback when confirmation revalidation fails.

- [ ] **Step 5: Implement preview and transactional confirmation**

```ts
await store.transaction(async (tx) => {
  const fresh = await validateRosterRows(tx, teamId, input.rows);
  if (fresh.some(({ blocking }) => blocking)) {
    throw new HttpError(409, 'roster_preview_stale', 'Roster preview must be refreshed');
  }
  for (const row of fresh.filter(({ outcome }) => outcome === 'ready')) {
    const subject = await findOrCreatePendingSubject(tx, row);
    await addMembership(tx, teamId, subject.uid, actor.uid);
  }
});
```

Update subject synchronization so a matching pending UID becomes active on first main-site authentication.

- [ ] **Step 6: Build upload, preview, and confirmation UI**

Use a file input limited to `.csv`, show every row outcome, disable confirmation for blocking errors, and show imported/skipped counts after success.

- [ ] **Step 7: Verify GREEN**

Run: `npm test -- apps/api/src/modules/sports apps/api/src/core/auth apps/web/src/modules/sports`

Expected: PASS for CSV edge cases, authorization, pending binding, atomicity, and UI feedback.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/sports apps/api/src/core/auth apps/api/src/app.ts apps/web/src/modules/sports
git commit -m "feat: add sports roster csv import"
```

### Task 9: Enforce Organization-Scoped Finance Governance

**Files:**
- Modify: `apps/api/src/modules/finance/service.ts`
- Modify: `apps/api/src/modules/finance/router.ts`
- Modify: `apps/api/src/modules/finance/router.test.ts`
- Modify: `apps/api/src/modules/finance/scope-regressions.test.ts`
- Modify: `apps/web/src/modules/finance/FinancePage.tsx`
- Modify: `apps/web/src/modules/finance/FinancePage.test.tsx`

**Interfaces:**
- Produces organization-scoped finance list/create/update.
- Produces: `POST /finance/records/:recordId/reviews` with `{ decision: 'approved' | 'rejected' }`.
- Consumes: organization lead mapping and Tuanwei lead role.

- [ ] **Step 1: Write failing scope and module-visibility tests**

```ts
expect((await artsLead.get('/api/development/v1/finance/records')).body.data)
  .toEqual([expect.objectContaining({ organizationId: 'arts_center' })]);
expect((await artsDirector.get('/api/development/v1/finance/records')).status).toBe(403);
expect((await tuanweiLead.post(`/api/development/v1/finance/records/${id}/reviews`)
  .send({ decision: 'approved' })).status).toBe(200);
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- apps/api/src/modules/finance apps/web/src/modules/finance`

Expected: FAIL because finance currently uses broader legacy role permissions and no organization ownership.

- [ ] **Step 3: Implement lead-only scope policy**

Derive the actor’s lead organizations from active roles. Filter before serialization. Tuanwei lead and super admin may read all; only Tuanwei lead and super admin review.

- [ ] **Step 4: Add review state and audited mutations**

Reviews update status, reviewer UID, and reviewed timestamp in one transaction and record the previous and next state.

- [ ] **Step 5: Update the finance UI**

Render organization context, review state, and review actions. The module remains unmounted and absent from navigation for non-leads.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- apps/api/src/modules/finance apps/web/src/modules/finance apps/web/src/app/AppShell.test.tsx`

Expected: PASS for own-organization isolation, Tuanwei review, legacy unassigned records, and hidden navigation.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/finance apps/web/src/modules/finance
git commit -m "feat: scope finance governance to organization leads"
```

### Task 10: Demo Data, Integrated Verification, and Preview Handoff

**Files:**
- Modify: `apps/api/src/core/database/memory-store.ts`
- Modify: `scripts/seed.mjs`
- Modify: `apps/api/src/core/auth/demo-auth-client.ts`
- Modify: `apps/web/src/core/api/client.ts`
- Modify: `apps/web/src/core/auth/DemoUserSwitcher.tsx`
- Modify: `README.md`
- Modify: `docs/development_log.md`

**Interfaces:**
- Produces demo identities for ordinary student, platform admin, Rights member, Liaison member, organization lead, Sports director, and captain.
- Produces representative General/social knowledge, proposals, Interest Groups, an activity timeline with a 马约翰杯 fixture, sports roster, and scoped finance records.

- [ ] **Step 1: Write failing demo-smoke assertions**

Extend app and page tests to switch demo identities and assert that each sees exactly the permitted navigation and maintenance controls.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- apps/api/src/app.test.ts apps/web/src/core/auth apps/web/src/app/AppShell.test.tsx`

Expected: FAIL because the new demo identities and records are absent.

- [ ] **Step 3: Seed representative records and document accounts**

Keep demo-only authority out of production. Add deterministic memory and MySQL seed data matching the approved permission matrix.

- [ ] **Step 4: Run focused module suites**

Run: `npm test -- packages/contracts/src apps/api/src/core/organizations apps/api/src/modules apps/web/src`

Expected: PASS with no failed or skipped tests introduced by this iteration.

- [ ] **Step 5: Run repository-wide verification**

Run: `npm run check`

Expected: lint, formatting, type checking, unit/integration tests, operational tests, workflow tests, and production build all PASS.

- [ ] **Step 6: Run migration verification**

Run: `npm run db:migrate`

Expected: migration `007_platform_content_update.sql` applies once and a second run reports no pending migration without changing data.

- [ ] **Step 7: Start local memory/demo preview and smoke-test routes**

Run: `npm run dev`

Expected:

```text
Web: http://localhost:5173/development/
API: http://127.0.0.1:3100/api/development/v1/health
databaseMode: memory
```

Check dashboard brand return, hidden dashboard navigation, General/social knowledge visibility, proposal detail and maintenance, Interest Group compatibility redirect, event timeline and fixture, sports import preview, finance visibility, and theme persistence.

- [ ] **Step 8: Commit verified demo and documentation changes**

```bash
git add apps/api/src/core/database/memory-store.ts scripts/seed.mjs apps/api/src/core/auth/demo-auth-client.ts apps/web/src/core README.md docs/development_log.md
git commit -m "test: complete platform update preview coverage"
```

- [ ] **Step 9: Report the preview without opening a PR or deploying**

Provide the local preview URL, demo-account matrix, completed task count, verification evidence, and any intentionally deferred items. Leave the preview running only when the user asks to try it.
