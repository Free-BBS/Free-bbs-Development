import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EventsPage, type DevelopmentApi } from './EventsPage.js';

const activity = {
  id: 'activity-night-run',
  title: '夏日夜跑',
  description: '操场集合，一起完成五公里。',
  status: 'open',
  clubId: 'club-running',
  startsAt: '2026-08-01T11:00:00.000Z',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

function apiWith(request: DevelopmentApi['request']): DevelopmentApi {
  return { request };
}

describe('EventsPage', () => {
  it('shows loading, empty and error list states', async () => {
    let release: ((value: unknown[]) => void) | undefined;
    const loadingApi = apiWith(
      vi.fn(() => new Promise((resolve) => (release = resolve))) as DevelopmentApi['request'],
    );
    const loadingView = render(<EventsPage client={loadingApi} />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载活动');
    release?.([]);
    expect(await screen.findByText('暂无可报名的活动')).toBeInTheDocument();
    loadingView.unmount();

    const errorApi = apiWith(
      vi.fn().mockRejectedValue(new Error('请求失败')) as DevelopmentApi['request'],
    );
    render(<EventsPage client={errorApi} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('活动加载失败');
  });

  it('lists activities and registers, then cancels with feedback and a refresh', async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValueOnce([activity])
      .mockResolvedValueOnce({ id: 'registration-1' })
      .mockResolvedValueOnce([activity])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([activity]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EventsPage client={apiWith(request as DevelopmentApi['request'])} />);

    const card = await screen.findByRole('article', { name: '夏日夜跑' });
    expect(within(card).getByText('操场集合，一起完成五公里。')).toBeInTheDocument();
    expect(within(card).getByText(/2026/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: '报名夏日夜跑' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已报名夏日夜跑');
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/events/activities/activity-night-run/registrations',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );

    await user.click(within(card).getByRole('button', { name: '取消夏日夜跑报名' }));
    expect(confirm).toHaveBeenCalledWith('确定取消“夏日夜跑”的报名吗？');
    expect(await screen.findByRole('status')).toHaveTextContent('已取消夏日夜跑报名');
    expect(request).toHaveBeenNthCalledWith(
      4,
      '/events/activities/activity-night-run/registrations',
      { method: 'DELETE' },
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(5));
  });
});
