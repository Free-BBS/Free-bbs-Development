import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import { AuthProvider } from '../../core/auth/AuthProvider.js';
import { ApiClient } from '../../core/api/client.js';
import { SportsPage, type DevelopmentApi } from './SportsPage.js';

const teams = [
  {
    id: 'team-basketball',
    name: '篮球队',
    description: '院篮球代表队。',
    status: 'active',
    ownerUid: 'demo-sports-lead',
    scope: { type: 'sports_team', id: 'team-basketball' },
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'team-badminton',
    name: '羽毛球队',
    description: '院羽毛球代表队。',
    status: 'active',
    ownerUid: 'demo-sports-lead',
    scope: { type: 'sports_team', id: 'team-badminton' },
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
];

const captain: UserContext = {
  uid: 'captain-1',
  displayName: '篮球队队长',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [{ key: 'sports.team_captain', scope: { type: 'sports_team', id: 'team-basketball' } }],
};

function authClient(user: UserContext): ApiClient {
  return new ApiClient({
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: user, requestId: 'req-me' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  });
}

function apiWith(request: DevelopmentApi['request']): DevelopmentApi {
  return { request };
}

describe('SportsPage', () => {
  it('shows loading, empty and error list states', async () => {
    let release: ((value: unknown[]) => void) | undefined;
    const loadingApi = apiWith(
      vi.fn(() => new Promise((resolve) => (release = resolve))) as DevelopmentApi['request'],
    );
    const loadingView = render(
      <AuthProvider client={authClient(captain)}>
        <SportsPage client={loadingApi} />
      </AuthProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在加载代表队');
    release?.([]);
    expect(await screen.findByText('暂无体育代表队')).toBeInTheDocument();
    loadingView.unmount();

    const errorApi = apiWith(
      vi.fn().mockRejectedValue(new Error('请求失败')) as DevelopmentApi['request'],
    );
    render(
      <AuthProvider client={authClient(captain)}>
        <SportsPage client={errorApi} />
      </AuthProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('代表队加载失败');
  });

  it('shows a captain check-in form only on the scoped team and refreshes its check-ins', async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValueOnce(teams)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'checkin-1' })
      .mockResolvedValueOnce([
        {
          id: 'checkin-1',
          teamId: 'team-basketball',
          memberUid: 'student-18',
          checkinDate: '2026-07-22',
          status: 'present',
        },
      ]);

    render(
      <AuthProvider client={authClient(captain)}>
        <SportsPage client={apiWith(request as DevelopmentApi['request'])} />
      </AuthProvider>,
    );

    const ownTeam = await screen.findByRole('article', { name: '篮球队' });
    const otherTeam = screen.getByRole('article', { name: '羽毛球队' });
    expect(within(ownTeam).getByRole('form', { name: '篮球队签到' })).toBeInTheDocument();
    expect(within(otherTeam).queryByRole('form')).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith('/sports/teams/team-badminton/checkins');

    await user.type(within(ownTeam).getByLabelText('成员 UID'), 'student-18');
    await user.type(within(ownTeam).getByLabelText('签到日期'), '2026-07-22');
    await user.click(within(ownTeam).getByRole('button', { name: '记录签到' }));

    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberUid: 'student-18', checkinDate: '2026-07-22' }),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('签到已记录');
    await waitFor(() => expect(within(ownTeam).getByText(/student-18/)).toBeInTheDocument());
  });

  it('does not expose captain controls to an unscoped student', async () => {
    const student = { ...captain, uid: 'student-1', displayName: '普通同学', tags: [] };
    const request = vi.fn().mockResolvedValue(teams);
    render(
      <AuthProvider client={authClient(student)}>
        <SportsPage client={apiWith(request as DevelopmentApi['request'])} />
      </AuthProvider>,
    );
    await screen.findByRole('article', { name: '篮球队' });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
