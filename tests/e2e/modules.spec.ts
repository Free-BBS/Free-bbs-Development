import { expect, test } from '@playwright/test';

const apiRoot = '/api/development/v1';
const adminHeaders = {
  'Content-Type': 'application/json',
  'X-Demo-User': 'demo-admin',
};

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
  await expect(page.locator('.user-card')).toContainText('demo-student');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
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
test('replaces module owners and persists the new ownership set', async ({ page, request }) => {
  test.setTimeout(90_000);
  page.on('dialog', (dialog) => dialog.accept());
  const originalResponse = await request.get(`${apiRoot}/admin/modules/liaison/owners`, {
    headers: adminHeaders,
  });
  expect(originalResponse.status()).toBe(200);
  const original = (await originalResponse.json()) as {
    data: {
      owners: Array<{ ownerType: 'role' | 'subject' | 'team'; ownerId: string }>;
    };
  };
  const originalOwners = original.data.owners.map(({ ownerType, ownerId }) => ({
    ownerType,
    ownerId,
  }));

  try {
    const first = await request.put(`${apiRoot}/admin/modules/liaison/owners`, {
      headers: adminHeaders,
      data: { owners: [{ ownerType: 'subject', ownerId: 'demo-admin' }] },
    });
    expect(first.status(), await first.text()).toBe(200);

    await page.goto('./admin');
    await expect(page.locator('.user-card')).toContainText('demo-student');
    await page.getByLabel('Demo user').selectOption('demo-admin');
    await expect(page.locator('.user-card')).toContainText('demo-admin');
    await page.getByRole('tab', { name: '模块与负责人' }).click();
    await page.locator('.admin-definition-list button').filter({ hasText: 'liaison' }).click();
    const panel = page.getByRole('tabpanel', { name: '模块与负责人' });
    await expect(panel.locator('.record-card').filter({ hasText: 'demo-admin' })).toContainText(
      'subject',
    );

    const second = await request.put(`${apiRoot}/admin/modules/liaison/owners`, {
      headers: adminHeaders,
      data: { owners: [{ ownerType: 'role', ownerId: 'platform.super_admin' }] },
    });
    expect(second.status(), await second.text()).toBe(200);

    await page.reload();
    await expect(page.locator('.user-card')).toContainText('demo-student');
    await page.getByLabel('Demo user').selectOption('demo-admin');
    await expect(page.locator('.user-card')).toContainText('demo-admin');
    await page.getByRole('tab', { name: '模块与负责人' }).click();
    await page.locator('.admin-definition-list button').filter({ hasText: 'liaison' }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: '模块与负责人' })
        .locator('.record-card')
        .filter({ hasText: 'platform.super_admin' }),
    ).toContainText('role');
  } finally {
    const restored = await request.put(`${apiRoot}/admin/modules/liaison/owners`, {
      headers: adminHeaders,
      data: { owners: originalOwners },
    });
    expect(restored.status(), await restored.text()).toBe(200);
  }
});
