import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000, navigation: '.sidebar' },
  { name: 'tablet', width: 900, height: 900, navigation: '.mobile-nav' },
  { name: 'mobile', width: 390, height: 844, navigation: '.mobile-nav' },
] as const;

for (const viewport of viewports) {
  test(`${viewport.name} layout keeps dashboard and forms inside the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./dashboard');

    await expect(page.getByRole('heading', { name: '发展端工作台' })).toBeVisible();
    await expect(page.locator(viewport.navigation)).toBeVisible();
    if (viewport.name === 'mobile') {
      const headingBox = await page.getByRole('banner').getByRole('heading').boundingBox();
      const selectorBox = await page.getByLabel('Demo user').boundingBox();
      expect(headingBox).not.toBeNull();
      expect(selectorBox).not.toBeNull();
      expect((headingBox?.y ?? 0) + (headingBox?.height ?? 0)).toBeLessThanOrEqual(
        selectorBox?.y ?? 0,
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.goto('./information');
    await expect(page.getByRole('heading', { name: '提交咨询' })).toBeVisible();
    await expect(page.getByLabel('咨询标题')).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
