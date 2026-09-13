import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { SportsTeamDetailPage } from './SportsTeamDetailPage.js';
import type { SportsUser } from './SportsPage.js';

function sportsUser(uid: string, policies: SportsUser['policies'] = []): SportsUser {
  return {
    uid,
    displayName: uid,
    avatarUrl: null,
    baseRole: 'student',
    roles: [],
    tags: [],
    policies,
  };
}

describe('SportsTeamDetailPage', () => {
  it('loads the requested team and presents its roster and training schedule', async () => {
    const request = vi.fn().mockImplementation((path: string) => {
      if (path === '/sports/teams') {
        return Promise.resolve([
          {
            id: 'team-basketball',
            name: '篮球队',
            description: '院篮球代表队。',
            season: '2026 秋季',
            trainingSchedule: '每周二 18:00，篮球馆',
            status: 'active',
            scope: { type: 'sports_team', id: 'team-basketball' },
          },
        ]);
      }
      if (path === '/sports/teams/team-basketball/members') {
        return Promise.resolve([{ id: 'member-1', memberUid: 'student-1', isCaptain: true }]);
      }
      if (path === '/sports/teams/team-basketball/checkins') return Promise.resolve([]);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <SportsTeamDetailPage
          client={{ request }}
          teamId="team-basketball"
          user={sportsUser('captain-1', [
            {
              action: 'sports.team.update',
              resource: 'sports_team',
              scope: { type: 'sports_team', id: 'team-basketball' },
            },
          ])}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '篮球队' })).toBeInTheDocument();
    expect(screen.getByText('2026 秋季')).toBeInTheDocument();
    expect(screen.getByText('每周二 18:00，篮球馆')).toBeInTheDocument();
    expect(await screen.findByText(/student-1/)).toBeInTheDocument();
  });

  it('previews a two-column CSV without mutation and imports only after confirmation', async () => {
    const preview = [
      { row: 2, name: '张三', studentNumber: '20260001', outcome: 'ready', blocking: false },
      {
        row: 3,
        name: '李四',
        studentNumber: '20260002',
        outcome: 'name_mismatch',
        blocking: true,
      },
    ];
    const request = vi.fn().mockImplementation((path: string) => {
      if (path === '/sports/teams') {
        return Promise.resolve([
          {
            id: 'team-basketball',
            name: '篮球队',
            description: '院篮球代表队。',
            season: '2026 秋季',
            trainingSchedule: '每周二 18:00，篮球馆',
            status: 'active',
            scope: { type: 'sports_team', id: 'team-basketball' },
          },
        ]);
      }
      if (path.endsWith('/members') || path.endsWith('/checkins')) return Promise.resolve([]);
      if (path.endsWith('/roster-import/preview')) return Promise.resolve(preview);
      if (path.endsWith('/roster-import')) {
        return Promise.resolve({ imported: 1, skipped: 1, rows: preview });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SportsTeamDetailPage
          client={{ request }}
          teamId="team-basketball"
          user={sportsUser('manager-1', [
            {
              action: 'sports.team.update',
              resource: 'sports_team',
              scope: { type: 'sports_team', id: 'team-basketball' },
            },
          ])}
        />
      </MemoryRouter>,
    );

    const csv = '姓名,学号\n张三,20260001\n李四,20260002';
    const upload = await screen.findByLabelText('选择名单 CSV（姓名,学号）');
    await user.upload(upload, new File([csv], 'roster.csv', { type: 'text/csv' }));

    expect(await screen.findByText('姓名与现有账号不一致')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/roster-import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv,
    });
    expect(
      request.mock.calls.some(([path]) => path === '/sports/teams/team-basketball/roster-import'),
    ).toBe(false);
    expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
  });

  it('only exposes operations for the exact scoped team and honours an explicit deny', async () => {
    const request = vi.fn().mockResolvedValue([
      {
        id: 'team-basketball',
        name: '篮球队',
        description: '院篮球代表队。',
        season: '2026 秋季',
        trainingSchedule: '每周二 18:00，篮球馆',
        status: 'active',
        scope: { type: 'sports_team', id: 'team-basketball' },
      },
    ]);

    render(
      <MemoryRouter>
        <SportsTeamDetailPage
          client={{ request }}
          teamId="team-basketball"
          user={sportsUser('denied-manager', [
            {
              action: 'sports.team.update',
              resource: 'sports_team',
              scope: { type: 'sports_team', id: 'team-basketball' },
            },
            {
              action: 'sports.team.update',
              resource: 'sports_team',
              effect: 'deny',
              scope: { type: 'sports_team', id: 'team-basketball' },
            },
          ])}
        />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '篮球队' });
    expect(screen.queryByRole('button', { name: '添加成员' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('选择名单 CSV（姓名,学号）')).not.toBeInTheDocument();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });

  it('keeps captain check-in controls on the exact team detail without loading roster management', async () => {
    const team = {
      id: 'team-basketball',
      name: '篮球队',
      description: '院篮球代表队。',
      season: '2026 秋季',
      trainingSchedule: '每周二 18:00，篮球馆',
      status: 'active',
      scope: { type: 'sports_team', id: 'team-basketball' },
    };
    const request = vi.fn().mockImplementation((path: string) => {
      if (path === '/sports/teams') return Promise.resolve([team]);
      if (path.endsWith('/checkins')) return Promise.resolve([]);
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SportsTeamDetailPage
          client={{ request }}
          teamId="team-basketball"
          user={sportsUser('captain-1', [
            { action: 'sports.checkin.read', resource: 'sports_checkin', scope: team.scope },
            { action: 'sports.checkin.create', resource: 'sports_checkin', scope: team.scope },
          ])}
        />
      </MemoryRouter>,
    );

    const form = await screen.findByRole('form', { name: '训练签到' });
    await user.type(within(form).getByLabelText('成员 UID'), 'student-18');
    await user.type(within(form).getByLabelText('签到日期'), '2026-10-03');
    await user.click(within(form).getByRole('button', { name: '记录签到' }));

    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberUid: 'student-18', checkinDate: '2026-10-03' }),
    });
    expect(request.mock.calls.flat().join(' ')).not.toContain('/members');
  });

  it('keeps season and training-arrangement maintenance on the team detail page', async () => {
    const team = {
      id: 'team-basketball',
      name: '篮球队',
      description: '院篮球代表队。',
      season: '2026 秋季',
      trainingSchedule: '每周二 18:00，篮球馆',
      status: 'active',
      scope: { type: 'sports_team', id: 'team-basketball' },
    };
    const request = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/sports/teams' && init?.method === 'PATCH') return Promise.resolve(team);
      if (path === '/sports/teams') return Promise.resolve([team]);
      if (path.endsWith('/members') || path.endsWith('/checkins')) return Promise.resolve([]);
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SportsTeamDetailPage
          client={{ request }}
          teamId="team-basketball"
          user={sportsUser('manager-1', [
            { action: 'sports.team.update', resource: 'sports_team', scope: team.scope },
          ])}
        />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '篮球队' });
    await user.click(screen.getByRole('button', { name: '编辑队伍信息' }));
    await user.clear(screen.getByLabelText('赛季'));
    await user.type(screen.getByLabelText('赛季'), '2027 春季');
    await user.clear(screen.getByLabelText('训练或比赛安排'));
    await user.type(screen.getByLabelText('训练或比赛安排'), '每周五 19:00，篮球馆');
    await user.click(screen.getByRole('button', { name: '保存队伍信息' }));

    expect(request).toHaveBeenCalledWith('/sports/teams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'team-basketball',
        name: '篮球队',
        description: '院篮球代表队。',
        season: '2027 春季',
        trainingSchedule: '每周五 19:00，篮球馆',
      }),
    });
  });
});
