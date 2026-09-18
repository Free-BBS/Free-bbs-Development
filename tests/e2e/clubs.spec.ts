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
  const response = await request.post(`${apiRoot}/interest-groups/${id}/transitions`, {
    headers: headers('demo-admin'),
    data: { to },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('interest groups cover membership, support, archive and restore flows', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const name = `E2E 趣缘群体 ${suffix}`;
  const editedName = `${name} 已编辑`;
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('./interest-groups');
  await expect(page.getByRole('heading', { name: '趣缘群体', level: 2 })).toBeVisible();
  await switchUser(page, 'demo-admin');
  await page.getByRole('button', { name: '新建趣缘群体' }).click();
  await page.getByLabel('名称').fill(name);
  await page.getByLabel('介绍').fill('端到端俱乐部草稿。');
  await page.getByLabel('类别').fill('运动健康');
  await page.getByLabel('公开联系人').fill('club@example.test');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByRole('status')).toHaveText('趣缘群体草稿已创建');

  const card = page.locator('.workbench-card').filter({ hasText: name });
  await expect(card).toContainText('运动健康');
  await expect(card).toContainText('club@example.test');
  await card.getByRole('button', { name: `编辑${name}` }).click();
  await page.getByLabel('名称').fill(editedName);
  await page.getByLabel('介绍').fill('刷新后仍保留的俱乐部介绍。');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('status')).toHaveText('趣缘群体信息已保存');

  const list = await request.get(`${apiRoot}/interest-groups`, { headers: headers('demo-admin') });
  const clubs = (await list.json()) as { data: Array<{ id: string; name: string }> };
  const club = clubs.data.find((item) => item.name === editedName);
  expect(club).toBeTruthy();
  const id = club!.id;
  await transition(request, id, 'active');

  await switchUser(page, 'demo-student');
  await page.reload();
  const studentCard = page.locator('.workbench-card').filter({ hasText: editedName });
  await expect(studentCard.getByRole('button', { name: `编辑${editedName}` })).toHaveCount(0);
  await expect(studentCard.getByRole('heading', { name: '公开活动', exact: true })).toBeVisible();
  await studentCard.getByRole('button', { name: `加入${editedName}` }).click();
  await expect(page.getByRole('status')).toContainText('已提交');
  await studentCard.getByRole('button', { name: `撤回${editedName}申请` }).click();
  await expect(page.getByRole('status')).toHaveText('申请已撤回');
  await studentCard.getByRole('button', { name: `重新申请${editedName}` }).click();

  let membershipsResponse = await request.get(`${apiRoot}/interest-groups/${id}/memberships`, {
    headers: headers('demo-admin'),
  });
  let memberships = (await membershipsResponse.json()) as {
    data: Array<{ id: string; memberUid: string; status: string }>;
  };
  let membership = memberships.data.find((item) => item.memberUid === 'demo-student');
  expect(membership?.status).toBe('pending');
  let decision = await request.patch(
    `${apiRoot}/interest-groups/${id}/memberships/${membership!.id}`,
    {
      headers: headers('demo-admin'),
      data: { status: 'rejected' },
    },
  );
  expect(decision.status()).toBe(200);

  await page.reload();
  await studentCard.getByRole('button', { name: `重新申请${editedName}` }).click();
  membershipsResponse = await request.get(`${apiRoot}/interest-groups/${id}/memberships`, {
    headers: headers('demo-admin'),
  });
  memberships = (await membershipsResponse.json()) as typeof memberships;
  membership = memberships.data.find((item) => item.memberUid === 'demo-student');
  decision = await request.patch(`${apiRoot}/interest-groups/${id}/memberships/${membership!.id}`, {
    headers: headers('demo-admin'),
    data: { status: 'active' },
  });
  expect(decision.status()).toBe(200);
  await page.reload();
  await studentCard.getByRole('button', { name: `退出${editedName}` }).click();
  await expect(page.getByRole('status')).toContainText('已退出');

  for (const status of ['requested', 'confirmed']) {
    const support = await request.patch(`${apiRoot}/interest-groups/${id}/technical-support`, {
      headers: headers('demo-admin'),
      data: { status, note: 'E2E 技术支持' },
    });
    expect(support.status(), await support.text()).toBe(200);
  }

  const denied = await request.patch(`${apiRoot}/interest-groups`, {
    headers: headers('demo-student'),
    data: { id, name: '越权俱乐部' },
  });
  expect([403, 404]).toContain(denied.status());
  await transition(request, id, 'archived');
  await transition(request, id, 'active');
  const illegal = await request.post(`${apiRoot}/interest-groups/${id}/transitions`, {
    headers: headers('demo-admin'),
    data: { to: 'active' },
  });
  expect(illegal.status()).toBe(409);

  await page.reload();
  await switchUser(page, 'demo-admin');
  const persisted = page.locator('.workbench-card').filter({ hasText: editedName });
  await expect(persisted).toContainText('开放中');
  await expect(persisted).toContainText('刷新后仍保留的俱乐部介绍。');
});
