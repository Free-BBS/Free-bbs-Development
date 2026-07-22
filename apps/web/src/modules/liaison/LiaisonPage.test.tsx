import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import { ApiError, type ApiClient } from '../../core/api/client.js';
import { LiaisonPage } from './LiaisonPage.js';

const student: UserContext = {
  uid: 'demo-student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
};

const admin: UserContext = { ...student, uid: 'demo-admin', roles: ['platform.super_admin'] };

const resource = {
  id: 'resource-1',
  name: '校友联络邮箱',
  description: '用于校友合作事项的初次联系。',
  category: 'alumni',
  visibility: 'public' as const,
  status: 'active' as 'active' | 'archived',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

describe('LiaisonPage', () => {
  it('distinguishes loading, empty and error states for resources', async () => {
    const successClient = {
      request: vi.fn().mockResolvedValue([resource]),
    } as unknown as ApiClient;
    const successView = render(<LiaisonPage client={successClient} user={student} />);
    expect(screen.getByText('正在加载联络资源…')).toBeInTheDocument();
    expect(await screen.findByText('校友联络邮箱')).toBeInTheDocument();
    successView.unmount();

    const emptyClient = { request: vi.fn().mockResolvedValue([]) } as unknown as ApiClient;
    const emptyView = render(<LiaisonPage client={emptyClient} user={student} />);
    expect(await screen.findByText('当前范围内没有联络资源')).toBeInTheDocument();
    emptyView.unmount();

    const errorClient = {
      request: vi.fn().mockRejectedValue(new Error('offline')),
    } as unknown as ApiClient;
    render(<LiaisonPage client={errorClient} user={student} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法加载联络资源');
  });

  it('shows a clear permission state when restricted resources return 403', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/liaison/resources') return [resource];
      throw new ApiError(403, 'forbidden', 'Restricted liaison permission is required', null);
    });
    const user = userEvent.setup();
    render(<LiaisonPage client={{ request } as unknown as ApiClient} user={student} />);

    await screen.findByText('校友联络邮箱');
    await user.click(screen.getByRole('button', { name: '查询受限资源' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '你没有查看该范围受限联络资源的权限',
    );
    expect(screen.queryByText(/Restricted liaison/)).not.toBeInTheDocument();
  });

  it('lets authorized maintainers create and archive resources with a refresh after each write', async () => {
    const resources = [resource];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (path === '/liaison/resources' && method === 'GET') return [...resources];
      if (path === '/liaison/resources' && method === 'POST') {
        const input = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const created = { ...resource, id: 'resource-2', ...input };
        resources.push(created as typeof resource);
        return created;
      }
      if (path === '/liaison/resources' && method === 'PATCH') {
        resources[0] = { ...resources[0], status: 'archived' };
        return resources[0];
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    const user = userEvent.setup();
    render(<LiaisonPage client={{ request } as unknown as ApiClient} user={admin} />);

    await screen.findByText('校友联络邮箱');
    expect(screen.getByRole('heading', { name: '维护联络资源' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建资源' }));
    expect(screen.getByText('资源名称不能为空')).toBeInTheDocument();

    await user.type(screen.getByLabelText('资源名称'), '场地合作联系人');
    await user.type(screen.getByLabelText('资源说明'), '用于校内活动场地协调。');
    await user.type(screen.getByLabelText('资源分类'), 'venue');
    await user.click(screen.getByRole('button', { name: '创建资源' }));

    expect(await screen.findByRole('status')).toHaveTextContent('联络资源已创建');
    expect(request).toHaveBeenCalledWith(
      '/liaison/resources',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: '场地合作联系人',
          description: '用于校内活动场地协调。',
          category: 'venue',
          visibility: 'public',
          status: 'active',
          scope: { type: 'public', id: '*' },
        }),
      }),
    );
    expect(await screen.findByText('场地合作联系人')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '归档 校友联络邮箱' }));
    expect(await screen.findByRole('status')).toHaveTextContent('联络资源已归档');
    expect(request).toHaveBeenCalledWith(
      '/liaison/resources',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ id: 'resource-1', status: 'archived' }),
      }),
    );
    expect(
      request.mock.calls.filter(([path, init]) => path === '/liaison/resources' && !init),
    ).toHaveLength(3);
  });
});
