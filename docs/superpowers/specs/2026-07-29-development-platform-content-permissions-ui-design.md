# Development Platform Content, Permissions, and UI Design

**Status:** Approved

**Date:** 2026-07-29

## 1. Objective

This iteration turns the development platform from a module demonstration into a usable organization-facing workspace. It must:

- keep the dashboard as an unlisted landing page;
- model seven social-work organizations with independent membership levels;
- split the knowledge base into public and social-organization areas;
- add a public proposal pool maintained by the Rights Development Center;
- rename Clubs to Interest Groups and assign maintenance to the Liaison Center;
- add event details, timelines, progress, and competition previews;
- add safe CSV roster import for sports teams;
- restrict finance governance to organization leads;
- align the visual system with the main FREE BBS site and reuse the learning-map visual language where appropriate.

The implementation must preserve existing authentication integration, existing URLs where compatibility matters, audit logging, and server-side authorization.

## 2. Scope and Non-Goals

### In scope

- Web navigation, module labels, module visibility, and detail pages.
- Organization Tags, organization-level roles, and role/Tag synchronization.
- New and extended records, APIs, database migrations, demo data, and automated tests.
- Responsive light/dark styling aligned with the main site.

### Not in scope

- Creating a pull request or deploying this iteration.
- Replacing main-site authentication.
- Building a general-purpose workflow designer.
- Importing arbitrary spreadsheet formats; sports roster import accepts CSV only.
- Giving sports captains organization-level permissions automatically.

## 3. Organization and Permission Model

### 3.1 Social-work organization catalog

The platform has seven built-in social-work organizations:

| Organization ID             | Display name | Built-in Tag key                       |
| --------------------------- | ------------ | -------------------------------------- |
| `arts_center`               | 文艺中心     | `social_org.arts_center`               |
| `liaison_center`            | 联络中心     | `social_org.liaison_center`            |
| `sports_center`             | 体育中心     | `social_org.sports_center`             |
| `rights_development_center` | 权益发展中心 | `social_org.rights_development_center` |
| `tuanwei`                   | 团委         | `social_org.tuanwei`                   |
| `sast`                      | 科协         | `social_org.sast`                      |
| `tms`                       | TMS          | `social_org.tms`                       |

All seven Tags count as social-organization membership. Existing extensible Tags remain supported. `sports.team_captain` remains an independent, team-scoped Tag.

### 3.2 Organization levels

Every active membership has exactly one level inside one organization:

| Internal level | User-facing label | Meaning                                                                                   |
| -------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `member`       | 部员              | Works on content and drafts within the assigned organization.                             |
| `director`     | 部长              | Publishes and manages work within the assigned organization.                              |
| `lead`         | 负责人            | Holds the highest organization-level authority. “主席” is a display alias for this level. |

A subject may belong to multiple organizations and may hold a different level in each. A subject may not hold two active levels in the same organization.

### 3.3 Role compatibility

The current role keys for the four centers remain valid:

- Arts: `department.arts_member`, `department.arts_director`, `domain.arts_lead`
- Liaison: `department.liaison_member`, `department.liaison_director`, `domain.liaison_lead`
- Sports: `department.sports_member`, `department.sports_director`, `domain.sports_lead`
- Rights Development: `department.rights_development_member`, `department.rights_development_director`, `domain.rights_development_lead`

The existing affiliation member roles remain valid and receive director and lead peers:

- Tuanwei: `affiliation.tuanwei_member`, `affiliation.tuanwei_director`, `affiliation.tuanwei_lead`
- SAST: `affiliation.sast_member`, `affiliation.sast_director`, `affiliation.sast_lead`
- TMS: `affiliation.tms_member`, `affiliation.tms_director`, `affiliation.tms_lead`

A central organization catalog maps organization IDs, Tag keys, and the three role keys. Business modules consume this catalog rather than duplicating organization lists.

### 3.4 Atomic role and Tag synchronization

Organization membership is managed through one admin workflow that accepts a subject, organization, and level.

- Assigning a level atomically replaces any active level in the same organization and ensures the corresponding organization Tag is active.
- Revoking the final active organization role atomically revokes the corresponding organization Tag.
- Assignments in different organizations remain unchanged.
- Built-in organization Tag definitions are visible in Tag administration, but their subject assignments are managed through the organization-membership workflow.
- All changes emit audit records containing actor, subject, organization, previous level, and next level.

The server is the source of truth. Frontend visibility never substitutes for backend authorization.

## 4. Navigation and Module Visibility

- `/dashboard` remains the default route and overview page.
- Dashboard is omitted from desktop and mobile module navigation.
- The FREE BBS brand link returns to `/dashboard`.
- Module navigation is filtered using the authenticated user’s effective permissions.
- A hidden module remains protected by its API and route authorization.
- “社群与俱乐部” is renamed to “趣缘群体”.
- The canonical web route is `/interest-groups`; `/clubs` redirects to it.
- The finance module is absent for users without `finance.record.read`.
- The social-organization knowledge entry is absent for users without social-organization membership.

## 5. Knowledge Base

### 5.1 Sections and visibility

The knowledge page presents two entry points:

- `General`: visible to every authenticated student.
- `社工组织`: visible only to members of any of the seven social-work organizations.

Ordinary students must not receive social-organization entries from the API, even if they guess a record ID.

### 5.2 Record model

Knowledge entries retain the existing content types: workflow, FAQ, contact, retrospective, and notice. Each record additionally has:

- `audience`: `general` or `social_org`;
- `organizationId`: required for `social_org`, otherwise `null`;
- existing workflow status, owner, body, timestamps, and audit history.

Existing entries migrate to `audience=general` and `organizationId=null`.

### 5.3 Authorization

- All students may read published General entries.
- Social-organization members may read published entries across the entire social-organization area.
- A member may create and edit drafts belonging to their own organization.
- A director may publish and manage entries belonging to their own organization.
- A lead may manage social-organization entries across organizations.
- The platform super administrator retains global authority.

## 6. Information, Consultation, and Proposal Pool

The information module keeps announcements and consultations and adds a Proposal Pool.

### 6.1 Proposal fields

A proposal contains:

- title;
- problem description;
- proposed solution;
- category;
- submitter UID;
- public status;
- assignee UID or `null`;
- public progress summary;
- internal note;
- created and updated timestamps;
- workflow and audit history.

The public workflow statuses are `submitted`, `reviewing`, `researching`, `advancing`, `resolved`, and `closed`.

### 6.2 Public and maintenance views

- Every authenticated student may submit a proposal.
- Every authenticated student may browse the public proposal list and open public details.
- Public responses exclude internal notes and non-public audit details.
- Members, directors, and leads of the Rights Development Center may open the maintenance view and update category, status, assignee, public progress, and internal notes.
- Every maintenance write is audited.

## 7. Interest Groups

- Existing club records remain the storage-compatible base and are presented as Interest Groups.
- Every authenticated student may browse group details, see associated activities, join, and leave.
- Members, directors, and leads of the Liaison Center may create and maintain Interest Group records.
- Existing club IDs and API compatibility are preserved. A compatibility API alias may remain while new UI copy and routes use Interest Groups.

## 8. Activities, Timelines, and Competition Previews

### 8.1 Activity fields

Activities add:

- organizer organization ID;
- start and end time;
- location;
- full description;
- optional standing-activity flag;
- existing status, registration, and technical-support fields.

Legacy activities with no organization remain public and are managed by the platform super administrator until an organization is assigned.

### 8.2 Activity timeline

Each activity may contain ordered milestones with:

- date and time;
- title;
- type;
- description;
- completion status;
- display order.

Built-in types include host announcement, recruitment announcement, preliminary round, and final round. Custom types are allowed. The visible progress percentage is derived from completed milestones divided by total milestones; an empty timeline displays no percentage instead of `0%`.

### 8.3 Competition preview

Standing competition activities, such as 马约翰杯, may include fixtures with:

- round;
- participant A;
- participant B;
- scheduled time;
- location;
- status;
- optional score.

### 8.4 Authorization

- Every authenticated student may view published activity details, timelines, fixtures, and register or cancel registration.
- A member of any social-work organization may create a draft for their own organization.
- A director or lead may publish and maintain activities for their own organization.
- The platform super administrator retains global authority.

## 9. Sports Team CSV Import

### 9.1 Input and preview

Roster import accepts UTF-8 CSV, with or without BOM, and requires exactly the headers `姓名,学号`.

The server parses and validates the file before any write. Preview rows have one of these outcomes:

- ready to import;
- already on team;
- duplicate student number in file;
- name mismatch with existing subject;
- missing or invalid field.

Blocking errors disable confirmation. “Already on team” is a non-blocking skipped-row notice.

### 9.2 Confirmation and persistence

- Confirmation revalidates the normalized rows inside a transaction.
- Existing active subjects are linked by student number.
- A matching student number with a different name is rejected.
- An unknown student number creates a pending subject carrying the submitted name and student number, then creates the team membership.
- On the subject’s first successful main-site authentication, subject synchronization activates and binds the pending subject by student number.
- The import is atomic: a revalidation error rolls back the confirmed import.

### 9.3 Authorization and audit

- Sports Center directors, Sports Center leads, and the platform super administrator may import rosters.
- Team captains do not gain import permission from the captain Tag.
- The audit event stores actor, team, original filename, imported count, skipped count, and error count. Raw CSV content is not stored.

## 10. Finance Governance

Finance records add:

- owning organization ID;
- budget or settlement kind;
- amount;
- workflow status;
- reviewer UID and reviewed timestamp;
- existing activity reference and audit information.

Authorization is organization-scoped:

- An organization lead may read, create, and update records belonging to their own organization.
- The Tuanwei lead may read all organizations and approve or reject records.
- The platform super administrator may manage all records.
- Members, directors, ordinary students, and sports captains have no finance visibility.

Legacy finance records without an organization are visible only to the Tuanwei lead and platform super administrator until assigned.

## 11. Visual System

### 11.1 Main-site alignment

The development platform adopts the current main-site design tokens and proportions:

- sidebar background: `#063641`;
- active navigation and primary accent: `#278898`;
- light page background: `#f4f6f8`;
- light surface: `#ffffff`;
- compact 9–12px control and card radii;
- fine borders and restrained shadows;
- a 216px desktop sidebar and responsive bottom navigation;
- the existing FREE BBS emblem asset.

The app reads and writes the main-site theme storage key `free_bbs_theme_mode`, using `theme-light` and `theme-dark` body classes. Theme choice therefore persists across the main site and development platform.

### 11.2 Learning-map influence

Learning-map visuals are used selectively:

- activity timelines;
- proposal progress;
- competition nodes and selected detail overlays.

These elements use a dark canvas, subtle luminous connections, state nodes, and translucent detail panels. Data tables, forms, and administration remain on high-contrast main-site surfaces. The app respects `prefers-reduced-motion`.

### 11.3 Interaction and accessibility

- Active, hover, disabled, loading, and focus-visible states are distinct.
- Keyboard users can open details and operate timelines without pointer-only gestures.
- Empty, permission-denied, failed, and retry states follow a common component pattern.
- Mobile navigation keeps the active permitted module visible.

## 12. API, Error, and Audit Conventions

- Inputs are schema-validated and return the existing API envelope.
- Unauthorized collection access returns no protected records; unauthorized direct record access follows the existing concealment policy.
- State conflicts return `409`; malformed CSV and invalid fields return `400`; oversized files return `413`.
- Every privileged mutation records the actor, action, resource, organization scope, and relevant before/after state.
- Business services, not React components, enforce organization scope.

## 13. Migration and Compatibility

- Bootstrap remains idempotent for roles, Tags, permissions, and modules.
- New columns use safe defaults or nullable transitional values.
- Existing knowledge entries become General entries.
- Existing clubs retain IDs and memberships.
- Existing activities remain public; unassigned legacy activities require super-admin maintenance.
- Existing finance records without an organization remain restricted to Tuanwei lead and super admin.
- Existing Tuanwei and SAST member roles are preserved.
- `/clubs` redirects to `/interest-groups`.
- No migration deletes existing business data.

## 14. Verification

Automated coverage must include:

- organization catalog and bootstrap idempotency;
- one-level-per-organization enforcement;
- atomic role/Tag synchronization;
- multi-organization users with different levels;
- navigation visibility and hidden dashboard navigation;
- General versus social-organization knowledge isolation;
- proposal public and maintenance responses;
- Liaison Center Interest Group maintenance;
- activity detail, milestone progress, fixture visibility, and organization ownership;
- CSV BOM handling, quoting, duplicate rows, name mismatch, pending subjects, authorization, and transactional rollback;
- finance module visibility, own-organization isolation, Tuanwei approval, and super-admin access;
- old route compatibility;
- light/dark theme persistence and core responsive navigation.

The complete repository check, focused API and web tests, type checking, linting, formatting, and production build must pass before preview handoff.

## 15. Acceptance Criteria

The iteration is accepted when:

1. The dashboard remains the landing page but has no navigation item.
2. Users can hold different levels in multiple organizations without conflicting assignments.
3. Ordinary students cannot discover social-organization knowledge or finance data.
4. Public proposals are transparent while internal maintenance fields remain protected.
5. Interest Groups are publicly usable and maintained by the Liaison Center.
6. Activities expose time, location, description, timeline progress, and optional competition previews.
7. Sports managers can safely preview and atomically import `姓名,学号` CSV rosters.
8. Finance access is organization-scoped to leads and globally reviewed by the Tuanwei lead.
9. The visual shell matches the main site and the selected workflow visuals reference the learning-map style.
10. Existing data, routes, authentication, and audit behavior remain compatible.
