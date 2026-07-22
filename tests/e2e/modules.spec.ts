import { expect, test } from '@playwright/test';

const modules = [
  ['/dashboard', '发展端工作台'],
  ['/knowledge', '经验条目'],
  ['/information', '公开信息'],
  ['/clubs', '社群与俱乐部'],
  ['/events', '活动'],
  ['/liaison', '联络资源'],
  ['/sports', '体育代表队'],
  ['/finance', '财务治理'],
  ['/admin', '权限与模块管理'],
] as const;

test('navigates to every development module from the shell', async ({ page }) => {
  await page.goto('./dashboard');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.locator('.user-card')).toContainText('demo-admin');

  for (const [route, heading] of modules) {
    const link = page.locator(`.sidebar .module-nav a[href="/development${route}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/development${route}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
});

test('lets an ordinary student submit a consultation', async ({ page }) => {
  const title = `E2E 咨询 ${Date.now()}`;
  await page.goto('./information');

  await expect(page.getByRole('heading', { name: '提交咨询' })).toBeVisible();
  await page.getByLabel('咨询标题').fill(title);
  await page.getByLabel('咨询内容').fill('这是一条端到端测试咨询，用于验证普通同学提交入口。');
  await page.getByRole('button', { name: '提交咨询' }).click();

  await expect(page.getByRole('status')).toHaveText('咨询已提交');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});
