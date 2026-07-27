import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../core/api/client.js';
import { AdminPage } from './AdminPage.js';

const recordBase = {
  status: 'active',
  ownerUid: 'admin-1',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};
const subject = {
  ...recordBase,
  id: 'subject-1',
  uid: 'uid-1001',
  displayName: '测试用户',
  avatarUrl: null,
};
const roleAssignment = {
  ...recordBase,
  id: 'role-assignment-1',
  subjectUid: subject.uid,
  roleKey: 'department.sports_member',
  expiresAt: null,
};
const role = {
  ...recordBase,
  id: 'role-1',
  key: 'platform.super_admin',
  name: '平台最高管理员',
};
const module = {
  id: 'sports',
  name: '体育代表队',
  description: '代表队管理',
  route: '/sports',
  icon: 'sports',
  ownerTeam: '体育团队',
  status: 'enabled',
  requiredPermissions: [],
  order: 7,
};
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 20, total: items.length });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function governanceClient(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    '/admin/subjects?page=1&pageSize=20': page([subject]),
    '/admin/role-assignments?page=1&pageSize=20': page([roleAssignment]),
    '/admin/tag-assignments?page=1&pageSize=20': page([]),
    '/admin/roles': [role],
    '/admin/permissions': [],
    '/admin/role-permissions': [],
    '/admin/tag-definitions': [],
    '/admin/tag-permissions': [],
    '/admin/modules': [module],
    '/admin/modules/sports/owners': { moduleId: 'sports', owners: [] },
    '/admin/audit-logs?page=1&pageSize=20': page([]),
    '/admin/system-status': {
      version: 'b28b98f',
      dataMode: 'mysql',
      appliedMigrationCount: 4,
      moduleCounts: { total: 9, enabled: 8, disabled: 1 },
    },
    ...overrides,
  };
  return {
    request: vi.fn((path: string, init?: RequestInit) => {
      const keyed = `${init?.method ?? 'GET'} ${path}`;
      if (keyed in responses) return Promise.resolve(responses[keyed]);
      if (path in responses) return Promise.resolve(responses[path]);
      throw new Error(`Unexpected request ${keyed}`);
    }),
  };
}

describe('complete governance administration', () => {
  it('exposes seven keyboard-usable governance tabs and read-only internal keys', async () => {
    const client = governanceClient();
    render(<AdminPage client={client as unknown as Pick<ApiClient, 'request'>} />);

    const tabs = [
      '用户与授权',
      '角色与权限',
      'Tag 定义',
      '模块与负责人',
      '业务数据入口',
      '审计日志',
      '系统状态',
    ];
    for (const name of tabs) expect(screen.getByRole('tab', { name })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '角色与权限' }));
    expect(await screen.findByDisplayValue('platform.super_admin')).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('tab', { name: '系统状态' }));
    expect(await screen.findByText('b28b98f')).toBeInTheDocument();
  });

  it('searches paged subjects and grants scoped expiring role and Tag assignments', async () => {
    const client = governanceClient({
      'POST /admin/role-assignments': {
        ...roleAssignment,
        id: 'role-assignment-2',
        subjectUid: 'uid-2002',
      },
      'POST /admin/tag-assignments': {
        ...roleAssignment,
        id: 'tag-assignment-1',
        tagKey: 'sports.team_captain',
        scope: { type: 'sports_team', id: 'team-7' },
      },
    });
    render(<AdminPage client={client as unknown as Pick<ApiClient, 'request'>} />);
    expect((await screen.findAllByText('uid-1001')).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText('搜索用户'), 'uid-1001');
    await userEvent.selectOptions(screen.getByLabelText('用户状态'), 'active');
    await userEvent.click(screen.getByRole('button', { name: '筛选用户' }));
    expect(client.request).toHaveBeenCalledWith(
      '/admin/subjects?query=uid-1001&status=active&page=1&pageSize=20',
    );

    const roleForm = screen.getByRole('form', { name: '授予角色' });
    await userEvent.type(within(roleForm).getByLabelText('用户 UID'), 'uid-2002');
    await userEvent.selectOptions(
      within(roleForm).getByLabelText('角色'),
      'department.sports_member',
    );
    await userEvent.clear(within(roleForm).getByLabelText('作用域类型'));
    await userEvent.type(within(roleForm).getByLabelText('作用域类型'), 'department');
    await userEvent.clear(within(roleForm).getByLabelText('作用域 ID'));
    await userEvent.type(within(roleForm).getByLabelText('作用域 ID'), 'sports');
    await userEvent.type(within(roleForm).getByLabelText('到期时间'), '2027-07-27T12:00');
    await userEvent.click(within(roleForm).getByRole('button', { name: '授予角色' }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        '/admin/role-assignments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            subjectUid: 'uid-2002',
            roleKey: 'department.sports_member',
            scope: { type: 'department', id: 'sports' },
            expiresAt: '2027-07-27T04:00:00.000Z',
          }),
        }),
      ),
    );

    const tagForm = screen.getByRole('form', { name: '授予 Tag' });
    expect(within(tagForm).getByLabelText('Tag 到期时间')).toBeInTheDocument();
    expect(within(tagForm).getByLabelText('Tag 作用域 ID')).toBeInTheDocument();
  });

  it('confirms archival with UID, key, scope and impact, then waits for server success', async () => {
    const archive = deferred<unknown>();
    const client = governanceClient({
      'DELETE /admin/role-assignments/role-assignment-1': archive.promise,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminPage client={client as unknown as Pick<ApiClient, 'request'>} />);
    const revoke = await screen.findByRole('button', { name: '归档 uid-1001 的角色授权' });
    await userEvent.click(revoke);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('uid-1001'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('department.sports_member'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('public:*'));
    expect(screen.getAllByText('uid-1001').length).toBeGreaterThan(0);
    archive.resolve({ id: roleAssignment.id, status: 'inactive', archived: true });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '归档 uid-1001 的角色授权' }),
      ).not.toBeInTheDocument(),
    );
    confirm.mockRestore();
  });

  it('keeps role status unchanged on a protected server error and replaces permissions atomically', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const statusChange = deferred<unknown>();
    const client = governanceClient({
      'PATCH /admin/roles/platform.super_admin': statusChange.promise,
      'PUT /admin/roles/platform.super_admin/permissions': {
        roleKey: 'platform.super_admin',
        bindings: [],
      },
    });
    render(<AdminPage client={client as unknown as Pick<ApiClient, 'request'>} />);
    await userEvent.click(screen.getByRole('tab', { name: '角色与权限' }));
    const toggle = await screen.findByRole('button', { name: '停用平台最高管理员' });
    await userEvent.click(toggle);
    expect(screen.getByText('启用中')).toBeInTheDocument();
    statusChange.reject(new Error('必须保留有效的平台最高管理员'));
    expect(await screen.findByRole('alert')).toHaveTextContent('必须保留有效的平台最高管理员');
    expect(screen.getByText('启用中')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '保存角色权限' }));
    expect(client.request).toHaveBeenCalledWith(
      '/admin/roles/platform.super_admin/permissions',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ bindings: [] }) }),
    );
    confirm.mockRestore();
  });

  it('validates owner replacement, exposes domain links, filters audit pages, and shows status', async () => {
    const client = governanceClient();
    render(<AdminPage client={client as unknown as Pick<ApiClient, 'request'>} />);
    await userEvent.click(screen.getByRole('tab', { name: '模块与负责人' }));
    expect((await screen.findAllByText('体育代表队')).length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('负责人类型'), 'team');
    await userEvent.click(screen.getByRole('button', { name: '添加负责人' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('负责人标识');

    await userEvent.click(screen.getByRole('tab', { name: '业务数据入口' }));
    expect(screen.getByRole('link', { name: '进入知识库' })).toHaveAttribute('href', '/knowledge');
    expect(screen.getByText('异常与待处理')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /SQL|数据库/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '审计日志' }));
    await userEvent.type(screen.getByLabelText('操作人 UID'), 'admin-1');
    await userEvent.type(screen.getByLabelText('动作'), 'admin.role.update');
    await userEvent.click(screen.getByRole('button', { name: '筛选日志' }));
    expect(client.request).toHaveBeenCalledWith(
      '/admin/audit-logs?actorUid=admin-1&action=admin.role.update&page=1&pageSize=20',
    );
  });
});
