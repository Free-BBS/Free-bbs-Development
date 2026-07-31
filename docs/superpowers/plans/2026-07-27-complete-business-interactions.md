# Complete Business Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐七个业务域的创建、编辑、审批、状态流转、归档和浏览器交互，使九个页面在三种视口下均为可完整操作的真实页面。

**Architecture:** 先增加共享纯函数状态机和迁移 005，再在每个领域 service 中以事务实现合法迁移、越级 409 与独立拒绝审计。React 页面消费显式 transition/handling/member endpoints，不再通过通用 PATCH 任意写状态；最后用七域 Playwright 和九页响应式测试收口。

**Tech Stack:** TypeScript、Express、Zod、React、MySQL 8.4、Vitest、Supertest、Testing Library、Playwright。

## Global Constraints

- 依赖 `2026-07-27-production-core-governance.md` 完成后的数据库驱动授权；不得回退到硬编码角色判断。
- 所有状态改变必须走显式 transition endpoint；通用 PATCH 不接受 `status`。
- 非法迁移返回 409 `invalid_state_transition`，记录不变，并在业务事务之外写入拒绝审计。
- 删除优先归档；成员退出等历史行为更新状态，不物理删除。
- 财务金额继续使用整数分，不接受浮点金额。
- 普通用户只看到公开或本人/本作用域数据；页面隐藏不是权限边界，API 403/404 才是边界。
- 团委 `events.approve`、科协 `events.technical_support` 与 `clubs.technical_support` 必须绑定真实 API 和页面动作。
- 1440×1000、900×900、390×844 三种视口均不得横向溢出或遮挡主要动作。
- 所有任务先 RED、再 GREEN，独立提交并评审；共享存储和样式任务完成前不得并行修改相同文件。

---

### Task 1: 共享状态机与业务存储迁移

**Files:**

- Create: `apps/api/src/core/workflow/state-machine.ts`
- Create: `apps/api/src/core/workflow/state-machine.test.ts`
- Create: `database/migrations/005_business_workflows.sql`
- Create: `apps/api/src/core/database/business-workflow-store-contract.test.ts`
- Modify: `apps/api/src/core/database/types.ts`
- Modify: `apps/api/src/core/database/memory-store.ts`
- Modify: `apps/api/src/core/database/mysql-store.ts`
- Modify: `apps/api/src/core/database/migration-smoke.test.ts`
- Modify: `database/seeds/001_demo.sql`

**Interfaces:**

```ts
export type TransitionGraph<S extends string> = Readonly<Record<S, readonly S[]>>;
export function canTransition<S extends string>(graph: TransitionGraph<S>, from: S, to: S): boolean;

export interface SportsTeamMemberRecord extends StoredRecord {
  teamId: string;
  memberUid: string;
}
```

`ConsultationRecord` adds `assigneeUid` and `reply`; both `ClubRecord` and `ActivityRecord` add `technicalSupportStatus: 'not_requested'|'requested'|'confirmed'` and `technicalSupportNote`; `DevelopmentStore` adds `sportsTeamMembers`.

- [ ] **Step 1: 写失败测试**

```ts
const graph = { draft: ['published'], published: ['draft', 'archived'], archived: [] } as const;
expect(canTransition(graph, 'draft', 'published')).toBe(true);
expect(canTransition(graph, 'draft', 'archived')).toBe(false);
```

Also test both store adapters persist consultation handling, event technical support and unique sports team membership.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/core/workflow/state-machine.test.ts apps/api/src/core/database/business-workflow-store-contract.test.ts`

Expected: FAIL because helper, fields and repository are missing.

- [ ] **Step 3: 实现 migration 005 与 store parity**

Migration maps existing values exactly: consultations `submitted→open`, `triaged|processing→in_progress`; activities `open→published`, `closed|completed→finished`, `cancelled→archived`; finance `settled→archived`; club/sports `draft→active`. Add consultation assignment/reply columns, club and activity technical-support columns with `not_requested` defaults, and `sports_team_members` with unique `(team_id, member_uid)` and compatible foreign keys.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/core/workflow/state-machine.test.ts apps/api/src/core/database/business-workflow-store-contract.test.ts apps/api/src/core/database/migration-smoke.test.ts apps/api/src/core/database/mysql-store.test.ts apps/api/src/core/database/memory-store.test.ts`

Expected: all tests PASS with memory/MySQL parity.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/core/workflow apps/api/src/core/database database/migrations/005_business_workflows.sql database/seeds/001_demo.sql
git commit -m "feat: add business workflow foundation"
```

---

### Task 2: 经验库编辑、发布、撤回与归档

**Files:**

- Create: `apps/api/src/modules/knowledge/state-machine.test.ts`
- Modify: `apps/api/src/modules/knowledge/service.ts`
- Modify: `apps/api/src/modules/knowledge/router.ts`
- Modify: `apps/api/src/modules/knowledge/router.test.ts`
- Modify: `apps/web/src/modules/knowledge/KnowledgePage.tsx`
- Modify: `apps/web/src/modules/knowledge/KnowledgePage.test.tsx`

**Interface:** `POST /knowledge/entries/:entryId/transitions` body `{ to: 'draft'|'published'|'archived' }`; PATCH accepts only `type,title,body,scope`.

- [ ] **Step 1: 写失败测试**

Test `draft→published→draft→published→archived`, reject `draft→archived`, preserve record on rejection, and exercise create/edit/publish/withdraw/archive dialogs in the page.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/knowledge/state-machine.test.ts apps/web/src/modules/knowledge/KnowledgePage.test.tsx`

Expected: FAIL because transition route and edit/archive UI are missing.

- [ ] **Step 3: 实现 service 与页面**

Add `transition(actor,id,to): Promise<KnowledgeEntryRecord>`. Use `knowledge.entry.publish` for state actions, `knowledge.entry.update` for content changes, and audit from/to. Page shows current status, editing fields, confirmation and server error without optimistic state corruption.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/knowledge apps/web/src/modules/knowledge`

Expected: all knowledge API/UI tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/knowledge apps/web/src/modules/knowledge
git commit -m "feat: complete knowledge lifecycle"
```

---

### Task 3: 公告发布与咨询处理闭环

**Files:**

- Create: `apps/api/src/modules/information/state-machine.test.ts`
- Modify: `apps/api/src/modules/information/service.ts`
- Modify: `apps/api/src/modules/information/router.ts`
- Modify: `apps/api/src/modules/information/router.test.ts`
- Modify: `apps/api/src/modules/information/scope-regression.test.ts`
- Modify: `apps/web/src/modules/information/InformationPage.tsx`
- Modify: `apps/web/src/modules/information/InformationPage.test.tsx`

**Interfaces:**

```text
POST /information/announcements/:announcementId/transitions
PATCH /information/consultations/:consultationId/handling
POST /information/consultations/:consultationId/transitions
```

Handling body supports `assigneeUid?: string|null`, `reply?: string|null`; consultation states are `open→in_progress→resolved→closed` and `resolved→in_progress`.

- [ ] **Step 1: 写失败测试**

Test ordinary creation always starts `open`; requester edits only while open; maintainer assigns/replies/transitions; another student cannot read it; announcement follows the knowledge lifecycle.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/information/state-machine.test.ts apps/web/src/modules/information/InformationPage.test.tsx`

Expected: FAIL because handling/transition routes and admin UI are missing.

- [ ] **Step 3: 实现 API 与双视图页面**

Use `information.consultation.triage` for assignment, reply and manager transitions. Ordinary view exposes only own consultations; management view exposes scoped queue, assignee, reply and transition buttons. Remove status from both generic PATCH schemas.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/information apps/web/src/modules/information`

Expected: all information API/UI tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/information apps/web/src/modules/information
git commit -m "feat: complete information and consultation workflows"
```

---

### Task 4: 俱乐部维护、成员审批与技术支持

**Files:**

- Create: `apps/api/src/modules/clubs/state-machine.test.ts`
- Create: `apps/api/src/modules/clubs/membership-workflow.test.ts`
- Create: `apps/api/src/modules/clubs/technical-support.test.ts`
- Modify: `apps/api/src/modules/clubs/service.ts`
- Modify: `apps/api/src/modules/clubs/router.ts`
- Modify: `apps/api/src/modules/clubs/router.test.ts`
- Modify: `apps/web/src/modules/clubs/ClubsPage.tsx`
- Modify: `apps/web/src/modules/clubs/ClubsPage.test.tsx`

**Interfaces:**

```text
POST /clubs/:clubId/transitions             { to: 'active'|'archived' }
GET /clubs/:clubId/memberships
PATCH /clubs/:clubId/memberships/:id        { status: 'active'|'rejected' }
PATCH /clubs/:clubId/technical-support      { status: 'requested'|'confirmed', note?: string|null }
```

- [ ] **Step 1: 写失败测试**

Test join creates `pending`, maintainer approves/rejects, leave changes status to `left`, inactive clubs reject join, create/edit/archive/restore work, and SAST can confirm technical support without receiving unrelated club management.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/clubs/state-machine.test.ts apps/api/src/modules/clubs/membership-workflow.test.ts apps/api/src/modules/clubs/technical-support.test.ts apps/web/src/modules/clubs/ClubsPage.test.tsx`

Expected: FAIL because workflows are missing.

- [ ] **Step 3: 实现状态与页面**

Do not physically delete memberships. Ordinary list returns active clubs; managers can include archived. Page provides create/edit, member queue, activity links, archive/restore and technical support panel gated by `clubs.technical_support`.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/clubs apps/web/src/modules/clubs`

Expected: all clubs tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/clubs apps/web/src/modules/clubs
git commit -m "feat: complete club management workflows"
```

---

### Task 5: 活动审批、技术支持与生命周期

**Files:**

- Create: `apps/api/src/modules/events/state-machine.test.ts`
- Create: `apps/api/src/modules/events/technical-support.test.ts`
- Modify: `apps/api/src/modules/events/service.ts`
- Modify: `apps/api/src/modules/events/router.ts`
- Modify: `apps/api/src/modules/events/router.test.ts`
- Modify: `apps/api/src/modules/events/review-regressions.test.ts`
- Modify: `apps/web/src/modules/events/EventsPage.tsx`
- Modify: `apps/web/src/modules/events/EventsPage.test.tsx`

**Interfaces:**

```text
POST /events/activities/:id/transitions
PATCH /events/activities/:id/technical-support
```

States: `draft→pending`, `pending→approved|rejected`, `rejected→draft`, `approved→published→finished→archived`. Only `published` accepts registration.

- [ ] **Step 1: 写失败测试**

Test creator submits, Tuanwei approves/rejects, creator edits rejected then resubmits, SAST confirms technical support, ordinary registration only on published event, and illegal edge returns 409 with audit.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/events/state-machine.test.ts apps/api/src/modules/events/technical-support.test.ts apps/web/src/modules/events/EventsPage.test.tsx`

Expected: FAIL because lifecycle and page management actions are missing.

- [ ] **Step 3: 实现显式审批状态机**

Remove status from PATCH. Map `events.approve` only to pending approval/rejection, `events.technical_support` only to support confirmation, and creator/update permissions to other legal edges. Page renders status-specific actions and approval/support details.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/events apps/web/src/modules/events`

Expected: all event tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/events apps/web/src/modules/events
git commit -m "feat: add complete activity approval workflow"
```

---

### Task 6: 联络资源编辑、可见性与归档

**Files:**

- Create: `apps/api/src/modules/liaison/state-machine.test.ts`
- Modify: `apps/api/src/modules/liaison/service.ts`
- Modify: `apps/api/src/modules/liaison/router.ts`
- Modify: `apps/api/src/modules/liaison/router.test.ts`
- Modify: `apps/api/src/modules/liaison/scope-regression.test.ts`
- Modify: `apps/web/src/modules/liaison/LiaisonPage.tsx`
- Modify: `apps/web/src/modules/liaison/LiaisonPage.test.tsx`

**Interface:** `POST /liaison/resources/:resourceId/transitions` with `active|archived`; PATCH accepts content, visibility and scope only.

- [ ] **Step 1: 写失败测试**

Test full edit, restricted visibility, scoped manager update, archive/restore, ordinary hidden archived record and sensitive-read audit.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/liaison/state-machine.test.ts apps/web/src/modules/liaison/LiaisonPage.test.tsx`

Expected: FAIL because transition and full edit UI are missing.

- [ ] **Step 3: 实现 API 与可见范围 UI**

Show human visibility label plus read-only scope key. Preserve anti-enumeration and sensitive read audit. Archived records remain available only in management view.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/liaison apps/web/src/modules/liaison`

Expected: all liaison tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/liaison apps/web/src/modules/liaison
git commit -m "feat: complete liaison resource management"
```

---

### Task 7: 体育队伍、成员、队长与签到

**Files:**

- Create: `apps/api/src/modules/sports/state-machine.test.ts`
- Create: `apps/api/src/modules/sports/member-management.test.ts`
- Create: `apps/api/src/modules/sports/captain-management.test.ts`
- Modify: `apps/api/src/modules/sports/service.ts`
- Modify: `apps/api/src/modules/sports/router.ts`
- Modify: `apps/api/src/modules/sports/router.test.ts`
- Modify: `apps/api/src/modules/sports/store-contract.test.ts`
- Modify: `apps/web/src/modules/sports/SportsPage.tsx`
- Modify: `apps/web/src/modules/sports/SportsPage.test.tsx`

**Interfaces:**

```text
POST /sports/teams/:teamId/transitions
GET|POST /sports/teams/:teamId/members
DELETE /sports/teams/:teamId/members/:memberUid
POST /sports/teams/:teamId/captains
DELETE /sports/teams/:teamId/captains/:memberUid
```

- [ ] **Step 1: 写失败测试**

Test team create/edit/archive/restore, unique membership, captain only assigned to a current member, captain endpoint writes exact `sports_team` Tag scope, removal immediately revokes check-in, and cross-team access remains hidden.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/sports/state-machine.test.ts apps/api/src/modules/sports/member-management.test.ts apps/api/src/modules/sports/captain-management.test.ts apps/web/src/modules/sports/SportsPage.test.tsx`

Expected: FAIL because member/captain routes and management UI are missing.

- [ ] **Step 3: 实现领域门面**

Captain operations call the governance assignment service, never duplicate authorization logic. Reject wildcard scope, non-member target and removing a member who remains captain until captain Tag is revoked in the same transaction.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/sports apps/web/src/modules/sports`

Expected: all sports tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/sports apps/web/src/modules/sports
git commit -m "feat: complete sports team administration"
```

---

### Task 8: 财务编辑、提交、审批与归档

**Files:**

- Create: `apps/api/src/modules/finance/state-machine.test.ts`
- Modify: `apps/api/src/modules/finance/service.ts`
- Modify: `apps/api/src/modules/finance/router.ts`
- Modify: `apps/api/src/modules/finance/router.test.ts`
- Modify: `apps/api/src/modules/finance/scope-regressions.test.ts`
- Modify: `apps/web/src/modules/finance/FinancePage.tsx`
- Modify: `apps/web/src/modules/finance/FinancePage.test.tsx`

**Interface:** `POST /finance/records/:recordId/transitions`; states `draft→submitted`, `submitted→approved|rejected`, `rejected→draft`, `approved|rejected→archived`.

- [ ] **Step 1: 写失败测试**

Test draft edit, submit, approve/reject permission split, rejected edit only after returning to draft, activity/scope integrity, integer cents and archive.

- [ ] **Step 2: 运行 RED**

Run: `npx vitest run apps/api/src/modules/finance/state-machine.test.ts apps/web/src/modules/finance/FinancePage.test.tsx`

Expected: FAIL because transitions and management UI are missing.

- [ ] **Step 3: 实现 API 与页面**

Remove status from PATCH, remove `settled`, keep activity validation in the transaction, and audit amount/status changes without logging credentials or unrelated user data.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/api/src/modules/finance apps/web/src/modules/finance`

Expected: all finance tests PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/modules/finance apps/web/src/modules/finance
git commit -m "feat: complete finance approval lifecycle"
```

---

### Task 9: 九页响应式与共享交互壳层

**Files:**

- Modify: `apps/web/index.html`
- Modify: `apps/web/src/app/AppShell.tsx`
- Modify: `apps/web/src/app/AppShell.test.tsx`
- Modify: `apps/web/src/components/DialogForm.tsx`
- Modify: `apps/web/src/components/Components.test.tsx`
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/shell.css`
- Modify: `apps/web/src/styles/components.css`
- Modify: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: 扩展响应式失败测试**

For every route and each 1440/900/390 viewport assert `scrollWidth <= innerWidth`, visible current nav item, reachable primary action and dialog footer. Also assert long UID/scope strings wrap and Syne/Noto Serif SC are loaded from the same font request used by the main site.

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/e2e/responsive.spec.ts`

Expected: FAIL on pages and viewports not currently covered.

- [ ] **Step 3: 修复共享布局**

Map main-site brand fonts, deep gradient/glass tokens, radii and motion without copying its full stylesheet. Keep high-density admin content readable, bottom navigation horizontally reachable and dialogs scrollable at 390px.

- [ ] **Step 4: 运行 GREEN**

Run: `npx vitest run apps/web/src/app/AppShell.test.tsx apps/web/src/components/Components.test.tsx && npx playwright test tests/e2e/responsive.spec.ts`

Expected: unit and all responsive cases PASS.

- [ ] **Step 5: 提交**

```powershell
git add apps/web/index.html apps/web/src/app apps/web/src/components apps/web/src/styles tests/e2e/responsive.spec.ts
git commit -m "feat: align complete responsive development ui"
```

---

### Task 10: 七域全链路 E2E

**Files:**

- Create: `tests/e2e/knowledge.spec.ts`
- Create: `tests/e2e/information.spec.ts`
- Create: `tests/e2e/clubs.spec.ts`
- Create: `tests/e2e/events.spec.ts`
- Create: `tests/e2e/liaison.spec.ts`
- Create: `tests/e2e/sports.spec.ts`
- Create: `tests/e2e/finance.spec.ts`
- Modify: `tests/e2e/modules.spec.ts`
- Modify: `tests/e2e/permissions.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: 写七域失败场景**

Each spec covers ordinary main flow, manager create/edit, every legal state edge, one illegal 409 edge, one unauthorized 403/404 edge, archive/restore or withdraw, and refresh persistence. Governance E2E covers subject, role/Tag expiry, binding replacement, module owner and audit filter.

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/e2e/knowledge.spec.ts tests/e2e/information.spec.ts tests/e2e/clubs.spec.ts tests/e2e/events.spec.ts tests/e2e/liaison.spec.ts tests/e2e/sports.spec.ts tests/e2e/finance.spec.ts`

Expected: FAIL until all new endpoints and pages are wired.

- [ ] **Step 3: 修复集成而不削弱权限断言**

Reset deterministic memory data per worker, use injected demo identities and keep all API denial assertions. Do not replace full flows with route mocks.

- [ ] **Step 4: 运行 GREEN 与计划门禁**

Run: `npx playwright test && npm run check`

Expected: all E2E and repository checks PASS.

- [ ] **Step 5: 提交**

```powershell
git add tests/e2e playwright.config.ts
git commit -m "test: verify complete business interactions"
```
