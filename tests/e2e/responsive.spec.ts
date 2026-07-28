import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000, navigation: '.sidebar .module-nav' },
  { name: 'tablet', width: 900, height: 900, navigation: '.mobile-nav' },
  { name: 'mobile', width: 390, height: 844, navigation: '.mobile-nav' },
] as const;

const fontStylesheetHref =
  'https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&family=Noto+Serif+SC:wght@400;500;600;700&display=swap';

const routes: readonly {
  path: string;
  heading: string;
  primaryAction: (page: Page) => Locator;
}[] = [
  {
    path: 'dashboard',
    heading: '发展端工作台',
    primaryAction: (page) => page.getByTestId('dashboard-module-card').first(),
  },
  {
    path: 'knowledge',
    heading: '经验条目',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'information',
    heading: '公开信息',
    primaryAction: (page) => page.getByRole('button', { name: '提交咨询' }),
  },
  {
    path: 'clubs',
    heading: '社群与俱乐部',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'events',
    heading: '活动',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'liaison',
    heading: '联络资源',
    primaryAction: (page) => page.getByRole('button', { name: '创建资源' }),
  },
  {
    path: 'sports',
    heading: '体育代表队',
    primaryAction: (page) => page.getByRole('button', { name: '创建队伍草稿' }),
  },
  {
    path: 'finance',
    heading: '财务治理',
    primaryAction: (page) => page.getByRole('button', { name: '保存草稿' }),
  },
  {
    path: 'admin',
    heading: '治理管理台',
    primaryAction: (page) => page.getByRole('button', { name: '筛选用户' }),
  },
] as const;

async function expectMainSiteFontRequest(page: Page) {
  const fontStylesheet = page.locator(`link[rel="stylesheet"][href="${fontStylesheetHref}"]`);
  await expect(fontStylesheet).toHaveCount(1);
  await expect(fontStylesheet).toHaveAttribute('href', fontStylesheetHref);
  await expect(
    page.locator('link[rel="preconnect"][href="https://fonts.googleapis.com"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('link[rel="preconnect"][href="https://fonts.gstatic.com"][crossorigin]'),
  ).toHaveCount(1);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function expectLongTextWraps(target: Locator, value: string) {
  await expect(target).toBeVisible();
  await target.evaluate((element, text) => {
    element.textContent = text;
  }, value);
  expect(
    await target.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth &&
        document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const viewport of viewports) {
  test(`${viewport.name} keeps all nine routes and their actions reachable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      await page.goto(`./${route.path}`);
      if (route.path === 'dashboard') {
        await expectMainSiteFontRequest(page);
      }
      await page.getByLabel('Demo user').selectOption('demo-admin');
      await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
      await expect(page.locator('.user-card')).toContainText('demo-admin');
      await expect(
        page.getByRole('heading', { name: route.heading, exact: true }).first(),
      ).toBeVisible();

      const currentNavigation = page.locator(
        `${viewport.navigation} a[aria-current="page"][href="/development/${route.path}"]`,
      );
      await expect(currentNavigation).toBeVisible();
      await expect(currentNavigation).toBeInViewport();

      const primaryAction = route.primaryAction(page);
      await expect(primaryAction).toBeVisible();
      await primaryAction.scrollIntoViewIfNeeded();
      await expect(primaryAction).toBeInViewport();

      const openedDialogs = page.getByRole('dialog');
      for (let index = 0; index < (await openedDialogs.count()); index += 1) {
        const footer = openedDialogs.nth(index).locator('.dialog-form-actions');
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toBeInViewport();
      }

      await expectNoHorizontalOverflow(page);

      if (route.path === 'sports') {
        await expectLongTextWraps(
          page.locator('.workbench-card code').first(),
          `sports_team/${'scope-without-break-opportunities-'.repeat(12)}`,
        );
      }

      if (route.path === 'admin') {
        await expectLongTextWraps(
          page.locator('.record-card strong').first(),
          `uid-${'identifier-without-break-opportunities-'.repeat(12)}`,
        );
      }
    }
  });
}
