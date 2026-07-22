import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import { ApiError, type ApiClient } from '../../core/api/client.js';
import { KnowledgePage } from './KnowledgePage.js';

const admin: UserContext = {
  uid: 'demo-admin',
  displayName: '发展端管理员',
  avatarUrl: null,
  baseRole: 'student',
  roles: ['platform.super_admin'],
  tags: [],
};

const draft = {
  id: 'knowledge-1',
  type: 'retrospective' as const,
  title: '活动复盘模板',
  body: '记录目标、执行情况和改进项。',
  status: 'draft' as 'draft' | 'published' | 'archived',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

describe('KnowledgePage', () => {
  it('distinguishes loading, empty, error and successful list states', async () => {
    let resolveList!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => {
      resolveList = resolve;
    });
    const loadingClient = { request: vi.fn().mockReturnValue(pending) } as unknown as ApiClient;
    const loadingView = render(<KnowledgePage client={loadingClient} user={admin} />);
    expect(screen.getByText('正在加载经验条目…')).toBeInTheDocument();
    resolveList([draft]);
    expect(await screen.findByText('活动复盘模板')).toBeInTheDocument();
    loadingView.unmount();

    const emptyClient = {
      request: vi.fn().mockResolvedValue([]),
    } as unknown as ApiClient;
    const emptyView = render(<KnowledgePage client={emptyClient} user={admin} />);
    expect(await screen.findByText('经验库中还没有内容')).toBeInTheDocument();
    emptyView.unmount();

    const errorClient = {
      request: vi.fn().mockRejectedValue(new ApiError(503, 'module_disabled', '暂时不可用', null)),
    } as unknown as ApiClient;
    render(<KnowledgePage client={errorClient} user={admin} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法加载经验库');
  });

  it('validates and creates a draft, then publishes it and refreshes the list', async () => {
    const entries = [draft];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (path === '/knowledge/entries' && method === 'GET') return [...entries];
      if (path === '/knowledge/entries' && method === 'POST') {
        const input = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const created = { ...draft, id: 'knowledge-2', ...input };
        entries.push(created as typeof draft);
        return created;
      }
      if (path === '/knowledge/entries' && method === 'PATCH') {
        entries[0] = { ...entries[0], status: 'published' };
        return entries[0];
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    const user = userEvent.setup();
    render(<KnowledgePage client={{ request } as unknown as ApiClient} user={admin} />);

    await screen.findByText('活动复盘模板');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(screen.getByText('标题不能为空')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('经验标题'), '部门交接清单');
    await user.type(screen.getByLabelText('经验正文'), '列出账号、联系人和周期任务。');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));

    expect(await screen.findByRole('status')).toHaveTextContent('草稿已创建');
    expect(request).toHaveBeenCalledWith(
      '/knowledge/entries',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'workflow',
          title: '部门交接清单',
          body: '列出账号、联系人和周期任务。',
          status: 'draft',
          scope: { type: 'public', id: '*' },
        }),
      }),
    );
    expect(await screen.findByText('部门交接清单')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '发布 活动复盘模板' }));
    expect(await screen.findByRole('status')).toHaveTextContent('经验已发布');
    expect(request).toHaveBeenCalledWith(
      '/knowledge/entries',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ id: 'knowledge-1', status: 'published' }),
      }),
    );
    expect(screen.queryByRole('button', { name: '发布 活动复盘模板' })).not.toBeInTheDocument();
    expect(
      request.mock.calls.filter(([path, init]) => path === '/knowledge/entries' && !init),
    ).toHaveLength(3);
  });
});
