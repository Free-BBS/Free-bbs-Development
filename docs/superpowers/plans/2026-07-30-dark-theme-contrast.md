# Dark-theme Contrast Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix dark-theme navigation and governance-page contrast while making the administration business entry use the canonical “趣缘群体” name and route.

**Architecture:** Keep the existing React structure unchanged. Express the visual correction through the existing theme/component CSS boundary, and update only the stale administration link metadata.

**Tech Stack:** React 18, TypeScript, CSS custom properties, Vitest, Testing Library.

## Global Constraints

- Preserve the current FreeBBS main-site palette, typography, grid, layout, and light theme.
- Do not change permissions, APIs, database schema, or compatibility redirects.
- Run only focused web verification plus one real-browser visual audit.

---

### Task 1: Dark-theme contrast and canonical business entry

**Files:**

- Create: `apps/web/src/styles/theme-contract.test.ts`
- Modify: `apps/web/src/styles/theme.css`
- Modify: `apps/web/src/styles/components.css`
- Modify: `apps/web/src/modules/admin/sections/BusinessEntrySection.tsx`
- Modify: `apps/web/src/modules/admin/AdminPage.governance.test.tsx`

**Interfaces:**

- Consumes: existing `.module-icon img`, `.admin-governance-page`, `.admin-page-heading`, `.admin-tab-nav`, `.admin-definition-list`, `.secondary-button`, and `.admin-stat-grid` selectors.
- Produces: dark-theme CSS overrides and a canonical `/interest-groups` administration link named “进入趣缘群体”.

- [x] **Step 1: Write failing stylesheet and business-entry tests**

```ts
import { describe, expect, it } from 'vitest';

import componentsCss from './components.css?raw';
import themeCss from './theme.css?raw';

describe('dark-theme contrast contract', () => {
  it('provides a light treatment for external sidebar SVG images', () => {
    expect(themeCss).toMatch(
      /body\.theme-dark \.module-icon img[\s\S]*?filter:\s*brightness\(0\) invert\(1\)/,
    );
  });

  it('uses theme variables instead of a hard-coded white governance heading end color', () => {
    expect(componentsCss).toContain(
      'linear-gradient(135deg, var(--admin-paper), var(--admin-surface-end) 68%)',
    );
    expect(themeCss).toContain('--admin-surface-end:');
  });
});
```

Add this assertion after opening the business-data tab in `AdminPage.governance.test.tsx`:

```ts
expect(screen.getByRole('link', { name: '进入趣缘群体' })).toHaveAttribute(
  'href',
  '/development/interest-groups',
);
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm run test -w @freebbs-development/web -- src/styles/theme-contract.test.ts src/modules/admin/AdminPage.governance.test.tsx
```

Expected: FAIL because the icon filter, `--admin-surface-end`, and canonical administration link do not exist.

- [x] **Step 3: Implement the minimal CSS and link correction**

Add light-theme defaults under `.admin-governance-page` in `components.css`:

```css
--admin-surface-end: #fff;
--admin-tab-surface: rgba(255, 250, 240, 0.94);
--admin-tab-ink: rgba(33, 28, 23, 0.68);
--admin-hover-surface: rgba(255, 255, 255, 0.78);
--admin-action-ink: #704c12;
--admin-card-end: #fff;
```

Replace the corresponding hard-coded colors with these variables. Under the existing dark governance theme in `theme.css`, set dark values and add:

```css
body.theme-dark .module-icon img,
body:not(.theme-light) .module-icon img {
  filter: brightness(0) invert(1);
}
```

Update the business link metadata:

```ts
{
  href: '/interest-groups',
  label: '进入趣缘群体',
  description: '趣缘群体目录、公开活动与维护入口',
}
```

- [x] **Step 4: Run focused verification and verify GREEN**

Run:

```powershell
npm run test -w @freebbs-development/web -- src/styles/theme-contract.test.ts src/modules/admin/AdminPage.governance.test.tsx
npm run typecheck -w @freebbs-development/web
npx eslint apps/web/src/styles/theme-contract.test.ts apps/web/src/modules/admin/sections/BusinessEntrySection.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx
npx prettier apps/web/src/styles/theme.css apps/web/src/styles/components.css apps/web/src/styles/theme-contract.test.ts apps/web/src/modules/admin/sections/BusinessEntrySection.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx --check
```

Expected: all commands exit 0.

- [x] **Step 5: Verify the rendered page and commit**

Use the running local preview to confirm:

- sidebar icons are light and readable in dark mode;
- the governance heading and tabs use dark surfaces with readable text;
- “业务数据入口” opens “趣缘群体” at `/development/interest-groups`;
- the preview remains available at `http://localhost:5173/development/`.

Commit:

```powershell
git add apps/web/src/styles/theme-contract.test.ts apps/web/src/styles/theme.css apps/web/src/styles/components.css apps/web/src/modules/admin/sections/BusinessEntrySection.tsx apps/web/src/modules/admin/AdminPage.governance.test.tsx docs/superpowers/plans/2026-07-30-dark-theme-contrast.md
git commit -m "fix: improve dark theme administration contrast"
```
