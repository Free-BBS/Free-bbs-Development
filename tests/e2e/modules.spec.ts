import { expect, test, type Page } from '@playwright/test';

const apiRoot = '/api/development/v1';
const adminHeaders = {
  'Content-Type': 'application/json',
  'X-Demo-User': 'demo-admin',
};

const modules = [
  ['/knowledge', '/knowledge', 'General'],
  ['/information', '/information/announcements', '公开信息'],
  ['/interest-groups', '/interest-groups', '趣缘群体'],
  ['/events', '/events', '活动'],
  ['/liaison', '/liaison', '真实问题揭榜'],
  ['/sports', '/sports', '体育代表队'],
  ['/finance', '/finance', '财务治理'],
  ['/admin', '/admin', '治理管理台'],
] as const;

async function openAdmin(page: Page) {
  await page.goto('./dashboard');
  await expect(page.locator('.user-card')).toContainText('demo-student');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
  await expect(page.locator('.user-card')).toContainText('demo-admin');
  await page.locator('.sidebar .module-nav a[href="/development/admin"]').click();
  await expect(page).toHaveURL(/\/development\/admin$/);
}

test('navigates to every development module from the shell', async ({ page }) => {
  await page.goto('./dashboard');
  await expect(page.locator('.user-card')).toContainText('demo-student');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByLabel('Demo user')).toHaveValue('demo-admin');
  await expect(page.locator('.user-card')).toContainText('demo-admin');

  for (const [route, destination, heading] of modules) {
    const link = page.locator(`.sidebar .module-nav a[href="/development${route}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/development${destination}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
});

test('lets an ordinary student submit a consultation', async ({ page }) => {
  const title = `E2E 咨询 ${Date.now()}`;
  await page.goto('./information/consultations');

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

    await openAdmin(page);
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

    await openAdmin(page);
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
