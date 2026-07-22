import { expect, test, type APIRequestContext } from '@playwright/test';

const apiRoot = '/api/development/v1';

function demoHeaders(user: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Demo-User': user };
}

async function setModule(request: APIRequestContext, moduleId: string, enabled: boolean) {
  const response = await request.patch(`${apiRoot}/admin/modules`, {
    headers: demoHeaders('demo-admin'),
    data: { moduleId, enabled },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test('a captain can check in their own team but is denied across teams', async ({
  page,
  request,
}) => {
  await page.goto('./sports');
  await page.getByLabel('Demo user').selectOption('demo-captain');
  await expect(page.locator('.user-card')).toContainText('demo-captain');

  const ownTeam = page.getByRole('article', { name: '院篮球队' });
  const otherTeam = page.getByRole('article', { name: '院羽毛球队' });
  await expect(ownTeam.getByRole('form', { name: '院篮球队签到' })).toBeVisible();
  await expect(otherTeam.getByRole('form')).toHaveCount(0);

  const checkinForm = ownTeam.getByRole('form', { name: '院篮球队签到' });
  await checkinForm.getByLabel('成员 UID').fill(`e2e-member-${Date.now()}`);
  await checkinForm.getByLabel('签到日期').fill('2026-07-22');
  await checkinForm.getByRole('button', { name: '记录签到' }).click();
  await expect(page.getByRole('status')).toHaveText('签到已记录');

  const denied = await request.post(`${apiRoot}/sports/teams/team-badminton/checkins`, {
    headers: demoHeaders('demo-captain'),
    data: { memberUid: 'e2e-cross-team', checkinDate: '2026-07-22' },
  });
  expect(denied.status()).toBe(404);
  await expect(denied.json()).resolves.toMatchObject({
    data: { error: { code: 'sports_team_not_found' } },
  });
});

test('the administrator can grant and revoke a role with visible audit history', async ({
  page,
  request,
}) => {
  const existingResponse = await request.get(`${apiRoot}/admin/role-assignments`, {
    headers: demoHeaders('demo-admin'),
  });
  const existing = (await existingResponse.json()) as {
    data: Array<{ id: string; subjectUid: string; roleKey: string }>;
  };
  for (const assignment of existing.data.filter(
    (item) => item.subjectUid === 'demo-student' && item.roleKey === 'department.arts_member',
  )) {
    await request.delete(`${apiRoot}/admin/role-assignments/${assignment.id}`, {
      headers: demoHeaders('demo-admin'),
    });
  }

  await page.goto('./admin');
  await page.getByLabel('Demo user').selectOption('demo-admin');
  await expect(page.getByRole('heading', { name: '角色分配' })).toBeVisible();

  const roles = page.getByRole('region', { name: '角色分配' });
  await roles.getByLabel('用户 UID').fill('demo-student');
  await roles.getByRole('combobox').selectOption('department.arts_member');
  await roles.getByRole('button', { name: '授予角色' }).click();
  await expect(page.getByRole('status')).toHaveText('角色已授予');
  await expect(roles).toContainText('department.arts_member');

  await roles.getByRole('button', { name: '撤销 demo-student 的角色' }).click();
  await expect(page.getByRole('status')).toHaveText('角色已撤销');
  await expect(page.getByRole('region', { name: '审计日志' })).toContainText(
    'admin.role_assignment.grant',
  );
  await expect(page.getByRole('region', { name: '审计日志' })).toContainText(
    'admin.role_assignment.revoke',
  );
});

test('module disabling removes navigation and rejects the module API', async ({
  page,
  request,
}) => {
  await setModule(request, 'liaison', true);
  try {
    await page.goto('./admin');
    await page.getByLabel('Demo user').selectOption('demo-admin');
    await page.getByRole('button', { name: '停用联络资源' }).click();
    await expect(page.getByRole('status')).toHaveText('模块已停用');

    await page.goto('./dashboard');
    await expect(page.locator('.sidebar a[href="/development/liaison"]')).toHaveCount(0);
    await expect(
      page.locator('.sidebar [aria-disabled="true"]').filter({ hasText: '联络资源' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('dashboard-module-card').filter({ hasText: '联络资源' }),
    ).toHaveAttribute('aria-disabled', 'true');

    const disabledResponse = await request.get(`${apiRoot}/liaison/resources`, {
      headers: demoHeaders('demo-admin'),
    });
    expect(disabledResponse.status()).toBe(503);
    await expect(disabledResponse.json()).resolves.toMatchObject({
      data: { error: { code: 'module_disabled' } },
    });
  } finally {
    await setModule(request, 'liaison', true);
  }
});
