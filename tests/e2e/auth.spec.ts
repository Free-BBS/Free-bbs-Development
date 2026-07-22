import { expect, test } from '@playwright/test';

test('restores an authenticated demo session and can switch deterministic identities', async ({
  page,
}) => {
  await page.goto('./dashboard');

  await expect(page.getByRole('heading', { name: '发展端工作台' })).toBeVisible();
  await expect(page.locator('.user-card')).toContainText('普通同学');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-student');

  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.locator('.user-card')).toContainText('发展端管理员');
  await expect(page.locator('.user-card')).toContainText('demo-admin');

  await page.getByLabel('Demo user').selectOption('demo-student');
  await page.reload();
  await expect(page.getByRole('heading', { name: '发展端工作台' })).toBeVisible();
  await expect(page.locator('.user-card')).toContainText('普通同学');
});
