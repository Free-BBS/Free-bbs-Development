import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ClubsPage, type DevelopmentApi } from './ClubsPage.js';

const club = {
  id: 'club-running',
  name: '夜跑俱乐部',
  description: '每周组织校园夜跑。',
  status: 'active',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

function apiWith(request: DevelopmentApi['request']): DevelopmentApi {
  return { request };
}

describe('ClubsPage', () => {
  it('shows loading, empty and error list states', async () => {
    let release: ((value: unknown[]) => void) | undefined;
    const loadingApi = apiWith(
      vi.fn(() => new Promise((resolve) => (release = resolve))) as DevelopmentApi['request'],
    );
    const loadingView = render(<ClubsPage client={loadingApi} />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载俱乐部');
    release?.([]);
    expect(await screen.findByText('暂无可加入的俱乐部')).toBeInTheDocument();
    loadingView.unmount();

    const errorApi = apiWith(
      vi.fn().mockRejectedValue(new Error('网络不可用')) as DevelopmentApi['request'],
    );
    render(<ClubsPage client={errorApi} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('俱乐部加载失败');
  });

  it('lists clubs and joins, then leaves with feedback and a refresh', async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValueOnce([club])
      .mockResolvedValueOnce({ id: 'membership-1' })
      .mockResolvedValueOnce([club])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([club]);
    const client = apiWith(request as DevelopmentApi['request']);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ClubsPage client={client} />);
    const card = await screen.findByRole('article', { name: '夜跑俱乐部' });
    expect(within(card).getByText('每周组织校园夜跑。')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: '加入夜跑俱乐部' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已加入夜跑俱乐部');
    expect(request).toHaveBeenNthCalledWith(2, '/clubs/club-running/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    await user.click(within(card).getByRole('button', { name: '退出夜跑俱乐部' }));
    expect(confirm).toHaveBeenCalledWith('确定退出“夜跑俱乐部”吗？');
    expect(await screen.findByRole('status')).toHaveTextContent('已退出夜跑俱乐部');
    expect(request).toHaveBeenNthCalledWith(4, '/clubs/club-running/memberships', {
      method: 'DELETE',
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(5));
  });
});
