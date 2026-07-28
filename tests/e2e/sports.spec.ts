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
  const response = await request.post(`${apiRoot}/sports/teams/${id}/transitions`, {
    headers: headers('demo-sports-lead'),
    data: { to },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('sports covers captain check-in and complete team management', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const name = `E2E 代表队 ${suffix}`;
  const editedName = `${name} 已编辑`;
  const archivedDraftName = `E2E 草稿归档队 ${suffix}`;

  await page.goto('./sports');
  await expect(page.getByRole('heading', { name: '体育代表队', level: 2 })).toBeVisible();
  await switchUser(page, 'demo-captain');
  const ownTeam = page.locator('.workbench-card').filter({ hasText: '院篮球队' });
  const checkin = ownTeam.getByRole('form', { name: '院篮球队签到' });
  await checkin.getByLabel('成员 UID').fill('demo-captain');
  await checkin.getByLabel('签到日期').fill('2026-07-28');
  await checkin.getByRole('button', { name: '记录签到' }).click();
  await expect(page.getByText('签到已记录', { exact: true })).toBeVisible();

  await switchUser(page, 'demo-sports-lead');
  const create = page.getByRole('heading', { name: '创建代表队' }).locator('..');
  await create.getByLabel('队伍名称').fill(name);
  await create.getByLabel('队伍介绍').fill('端到端代表队草稿。');
  await create.getByRole('button', { name: '创建队伍草稿' }).click();
  await expect(page.getByText('队伍草稿已创建', { exact: true })).toBeVisible();
  const card = page.locator('.workbench-card').filter({ hasText: name });
  await card.getByRole('button', { name: '编辑队伍' }).click();
  await card.getByLabel('编辑队伍名称').fill(editedName);
  await card.getByLabel('编辑队伍介绍').fill('刷新后仍保留的队伍介绍。');
  await card.getByRole('button', { name: '保存队伍' }).click();
  await expect(page.getByText('队伍信息已更新', { exact: true })).toBeVisible();

  const list = await request.get(`${apiRoot}/sports/teams`, {
    headers: headers('demo-sports-lead'),
  });
  const teams = (await list.json()) as { data: Array<{ id: string; name: string }> };
  const team = teams.data.find((item) => item.name === editedName);
  expect(team).toBeTruthy();
  const id = team!.id;

  const archivedDraft = await request.post(`${apiRoot}/sports/teams`, {
    headers: headers('demo-sports-lead'),
    data: {
      name: archivedDraftName,
      description: '独立验证草稿可直接归档。',
      status: 'draft',
    },
  });
  expect(archivedDraft.status(), await archivedDraft.text()).toBe(201);
  const archivedDraftBody = (await archivedDraft.json()) as {
    data: { id: string; status: string };
  };
  expect(archivedDraftBody.data.status).toBe('draft');
  const archivedFromDraft = await request.post(
    `${apiRoot}/sports/teams/${archivedDraftBody.data.id}/transitions`,
    {
      headers: headers('demo-sports-lead'),
      data: { to: 'archived' },
    },
  );
  expect(archivedFromDraft.status(), await archivedFromDraft.text()).toBe(200);
  await expect(archivedFromDraft.json()).resolves.toMatchObject({
    data: { id: archivedDraftBody.data.id, status: 'archived' },
  });

  const draftCheckin = await request.post(`${apiRoot}/sports/teams/${id}/checkins`, {
    headers: headers('demo-sports-lead'),
    data: { memberUid: 'demo-student', checkinDate: '2026-07-28' },
  });
  expect(draftCheckin.status()).toBe(409);
  await transition(request, id, 'active');
  for (const path of ['members', 'captains']) {
    const added = await request.post(`${apiRoot}/sports/teams/${id}/${path}`, {
      headers: headers('demo-sports-lead'),
      data: { memberUid: 'demo-student' },
    });
    expect(added.status(), await added.text()).toBe(201);
  }
  const activeCheckin = await request.post(`${apiRoot}/sports/teams/${id}/checkins`, {
    headers: headers('demo-sports-lead'),
    data: { memberUid: 'demo-student', checkinDate: '2026-07-28' },
  });
  expect(activeCheckin.status()).toBe(201);
  let removed = await request.delete(`${apiRoot}/sports/teams/${id}/captains/demo-student`, {
    headers: headers('demo-sports-lead'),
  });
  expect(removed.status()).toBe(200);
  removed = await request.delete(`${apiRoot}/sports/teams/${id}/members/demo-student`, {
    headers: headers('demo-sports-lead'),
  });
  expect(removed.status()).toBe(204);

  const denied = await request.post(`${apiRoot}/sports/teams/${id}/checkins`, {
    headers: headers('demo-captain'),
    data: { memberUid: 'demo-captain', checkinDate: '2026-07-28' },
  });
  expect([403, 404]).toContain(denied.status());
  await transition(request, id, 'archived');
  await transition(request, id, 'active');
  const illegal = await request.post(`${apiRoot}/sports/teams/${id}/transitions`, {
    headers: headers('demo-sports-lead'),
    data: { to: 'active' },
  });
  expect(illegal.status()).toBe(409);

  await page.reload();
  await switchUser(page, 'demo-sports-lead');
  const persisted = page.locator('.workbench-card').filter({ hasText: editedName });
  await expect(persisted).toContainText('活跃');
  await expect(persisted).toContainText('刷新后仍保留的队伍介绍。');
});
