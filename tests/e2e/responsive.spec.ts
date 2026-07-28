import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000, navigation: '.sidebar .module-nav' },
  { name: 'tablet', width: 900, height: 900, navigation: '.mobile-nav' },
  { name: 'mobile', width: 390, height: 844, navigation: '.mobile-nav' },
] as const;

const fontStylesheetHref =
  'https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&family=Noto+Serif+SC:wght@400;500;600;700&display=swap';

// Each matrix case performs nine complete authenticated route loads.
const responsiveMatrixTimeout = 90_000;

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

  const metrics = await target.evaluate((element) => {
    const card = element.closest<HTMLElement>('.workbench-card, .record-card');
    const containingBlock = element.parentElement;
    if (!card || !containingBlock) {
      throw new Error('Long-text probe requires real card and text containing blocks');
    }

    const cardRect = card.getBoundingClientRect();
    const containerRect = containingBlock.getBoundingClientRect();
    const targetRect = element.getBoundingClientRect();
    const fragments = Array.from(element.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    const tolerance = 1;

    return {
      cardRectWidth: cardRect.width,
      containerClientWidth: containingBlock.clientWidth,
      containerRectWidth: containerRect.width,
      containerScrollWidth: containingBlock.scrollWidth,
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      fragmentCount: fragments.length,
      fragmentsContained: fragments.every(
        (rect) =>
          rect.left >= containerRect.left - tolerance &&
          rect.right <= containerRect.right + tolerance,
      ),
      targetRectHeight: targetRect.height,
      targetRectWidth: targetRect.width,
    };
  });

  expect(metrics.cardRectWidth).toBeGreaterThan(0);
  expect(metrics.containerClientWidth).toBeGreaterThan(0);
  expect(metrics.containerRectWidth).toBeGreaterThan(0);
  expect(metrics.targetRectWidth).toBeGreaterThan(0);
  expect(metrics.targetRectHeight).toBeGreaterThan(0);
  expect(metrics.fragmentCount).toBeGreaterThan(1);
  expect(metrics.fragmentsContained).toBe(true);
  expect(metrics.containerScrollWidth).toBeLessThanOrEqual(metrics.containerClientWidth + 1);
  expect(metrics.documentFits).toBe(true);
}

for (const viewport of viewports) {
  test(`${viewport.name} keeps all nine routes and their actions reachable`, async ({ page }) => {
    test.setTimeout(responsiveMatrixTimeout);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      await page.goto(`./${route.path}`);
      if (route.path === 'dashboard') {
        await expectMainSiteFontRequest(page);
      }
      await page.getByLabel('Demo user').selectOption('demo-admin');
      await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
      await expect(page.locator('.user-card')).toContainText('demo-admin');
      await page.waitForLoadState('networkidle');
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
      await expect(
        primaryAction,
        `${viewport.name}/${route.path} primary action should be reachable`,
      ).toBeInViewport();

      await expectNoHorizontalOverflow(page);

      if (route.path === 'sports') {
        await expectLongTextWraps(
          page.locator('.workbench-card code').first(),
          `SCOPE${'A'.repeat(512)}`,
        );
      }

      if (route.path === 'admin') {
        await expectLongTextWraps(
          page.locator('.record-card strong').first(),
          `UID${'9'.repeat(512)}`,
        );
      }
    }
  });
}
test('mobile dialog keeps an overflowing body scrollable and its footer reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./dashboard');
  await expect(page.getByRole('heading', { name: '发展端工作台' })).toBeVisible();

  await page.evaluate(() => {
    const fields = Array.from(
      { length: 20 },
      (_, index) => `
        <label for="dialog-probe-${index}">字段 ${index + 1}</label>
        <input id="dialog-probe-${index}" value="响应式对话框内容 ${index + 1}" />`,
    ).join('');
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.dataset.testid = 'responsive-dialog-probe';
    backdrop.innerHTML = `
      <div
        class="dialog-form"
        role="dialog"
        aria-modal="true"
        aria-label="响应式对话框探针"
        tabindex="-1"
      >
        <form class="dialog-form-layout">
          <header class="dialog-form-header">
            <h2>响应式对话框探针</h2>
            <p>使用 DialogForm 的真实共享 DOM contract 与样式。</p>
          </header>
          <div class="dialog-form-body">
            <div class="dialog-form-fields">${fields}</div>
          </div>
          <footer class="dialog-form-actions">
            <button type="button">取消</button>
            <button type="submit">保存</button>
          </footer>
        </form>
      </div>`;
    document.body.append(backdrop);
  });

  const dialog = page.getByRole('dialog', { name: '响应式对话框探针' });
  const body = dialog.locator('.dialog-form-body');
  const footer = dialog.locator('.dialog-form-actions');
  await expect(dialog).toBeVisible();
  await expect(footer).toBeInViewport();

  const dialogMetrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      left: rect.left,
      overflow: getComputedStyle(element).overflow,
      right: rect.right,
      top: rect.top,
    };
  });
  expect(dialogMetrics.left).toBeGreaterThanOrEqual(0);
  expect(dialogMetrics.top).toBeGreaterThanOrEqual(0);
  expect(dialogMetrics.right).toBeLessThanOrEqual(390);
  expect(dialogMetrics.bottom).toBeLessThanOrEqual(844);
  expect(dialogMetrics.overflow).toBe('hidden');

  const bodyMetrics = await body.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  expect(bodyMetrics.clientHeight).toBeGreaterThan(0);
  expect(bodyMetrics.scrollHeight).toBeGreaterThan(bodyMetrics.clientHeight);
  expect(bodyMetrics.overflowY).toBe('auto');

  const footerBeforeScroll = await footer.boundingBox();
  expect(footerBeforeScroll).not.toBeNull();
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      body.evaluate(
        (element) =>
          element.scrollTop > 0 &&
          element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
      ),
    )
    .toBe(true);
  await expect(footer).toBeInViewport();
  const footerAfterScroll = await footer.boundingBox();
  expect(footerAfterScroll).not.toBeNull();
  expect(footerAfterScroll?.y).toBeCloseTo(footerBeforeScroll?.y ?? 0, 0);
  await expectNoHorizontalOverflow(page);
});
