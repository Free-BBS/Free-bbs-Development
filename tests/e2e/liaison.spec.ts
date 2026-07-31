import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const apiRoot = '/api/development/v1';
const headers = (user: string) => ({
  'Content-Type': 'application/json',
  'X-Demo-User': user,
});

async function switchUser(page: Page, user: string) {
  await page.getByLabel('Demo user').selectOption(user);
  await expect(page.getByLabel('Demo user')).toHaveValue(user);
}

async function transition(request: APIRequestContext, id: string, to: string) {
  const response = await request.post(`${apiRoot}/liaison/resources/${id}/transitions`, {
    headers: headers('demo-admin'),
    data: { to },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('liaison covers public discovery, manager editing, archive and restore', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const name = `E2E 联络资源 ${suffix}`;
  const editedName = `${name} 已编辑`;

  await page.goto('./liaison');
  await expect(page.getByRole('heading', { name: '联络资源', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '维护联络资源' })).toHaveCount(0);

  await switchUser(page, 'demo-admin');
  const create = page.getByRole('heading', { name: '维护联络资源' }).locator('..');
  await create.getByLabel('资源名称').fill(name);
  await create.getByLabel('资源说明').fill('端到端公开联络资源。');
  await create.getByLabel('资源分类').fill('contact');
  await create.getByRole('button', { name: '创建资源' }).click();
  await expect(page.getByRole('status')).toHaveText('联络资源已创建');

  const card = page.locator('.record-card').filter({ hasText: name });
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  await card.getByLabel('编辑资源名称').fill(editedName);
  await card.getByLabel('编辑资源说明').fill('刷新后仍保留的资源说明。');
  await card.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('status')).toHaveText('联络资源已更新');

  const list = await request.get(`${apiRoot}/liaison/resources`, {
    headers: headers('demo-admin'),
  });
  const resources = (await list.json()) as { data: Array<{ id: string; name: string }> };
  const resource = resources.data.find((item) => item.name === editedName);
  expect(resource).toBeTruthy();
  const id = resource!.id;

  await switchUser(page, 'demo-student');
  await page.reload();
  await expect(page.getByRole('heading', { name: editedName })).toBeVisible();
  const denied = await request.patch(`${apiRoot}/liaison/resources`, {
    headers: headers('demo-student'),
    data: { id, name: '越权资源' },
  });
  expect([403, 404]).toContain(denied.status());

  await transition(request, id, 'archived');
  await transition(request, id, 'active');
  const illegal = await request.post(`${apiRoot}/liaison/resources/${id}/transitions`, {
    headers: headers('demo-admin'),
    data: { to: 'active' },
  });
  expect(illegal.status()).toBe(409);

  await page.reload();
  await switchUser(page, 'demo-admin');
  const persisted = page.locator('.record-card').filter({ hasText: editedName });
  await expect(persisted).toContainText('公开 · 使用中');
  await expect(persisted).toContainText('刷新后仍保留的资源说明。');
});
