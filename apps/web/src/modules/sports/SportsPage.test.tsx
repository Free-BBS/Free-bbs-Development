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

const captain: UserContext & {
  policies: Array<{
    action: string;
    resource: string;
    effect: 'allow';
    scope: { type: string; id: string };
  }>;
} = {
  uid: 'captain-1',
  displayName: '篮球队队长',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [{ key: 'sports.team_captain', scope: { type: 'sports_team', id: 'team-basketball' } }],
  policies: [
    {
      action: 'sports.checkin.read',
      resource: 'sports_checkin',
      effect: 'allow',
      scope: { type: 'sports_team', id: 'team-basketball' },
    },
    {
      action: 'sports.checkin.create',
      resource: 'sports_checkin',
      effect: 'allow',
      scope: { type: 'sports_team', id: 'team-basketball' },
    },
  ],
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
  it('manages a scoped team with server-confirmed member and captain state', async () => {
    const manager: UserContext & {
      policies: Array<{ action: string; resource: string; scope: { type: string; id: string } }>;
    } = {
      ...captain,
      uid: 'manager-1',
      tags: [],
      policies: [
        {
          action: 'sports.*',
          resource: 'sports_team',
          scope: { type: 'sports_team', id: 'team-basketball' },
        },
      ],
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce([teams[0]])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'member-1', memberUid: 'student-18' })
      .mockResolvedValueOnce([{ id: 'member-1', memberUid: 'student-18' }]);
    const user = userEvent.setup();

    render(
      <AuthProvider client={authClient(manager)}>
        <SportsPage client={apiWith(request as DevelopmentApi['request'])} />
      </AuthProvider>,
    );

    const team = await screen.findByRole('article', { name: teams[0].name });
    expect(within(team).getByText('sports_team/team-basketball')).toBeInTheDocument();
    await user.type(within(team).getByLabelText('添加成员 UID'), 'student-18');
    await user.click(within(team).getByRole('button', { name: '添加成员' }));
    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberUid: 'student-18' }),
    });
    expect(await within(team).findByText('student-18')).toBeInTheDocument();
  });
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

  it('loads check-in history for a read-only scoped user without showing create controls', async () => {
    const reader = {
      ...captain,
      uid: 'sports-reader',
      tags: [],
      policies: [
        {
          action: 'sports.checkin.read',
          resource: 'sports_checkin',
          effect: 'allow' as const,
          scope: { type: 'sports_team', id: 'team-basketball' },
        },
      ],
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce([teams[0]])
      .mockResolvedValueOnce([
        {
          id: 'checkin-read-only',
          teamId: 'team-basketball',
          memberUid: 'student-18',
          checkinDate: '2026-07-22',
          status: 'present',
        },
      ]);

    render(
      <AuthProvider client={authClient(reader)}>
        <SportsPage client={apiWith(request as DevelopmentApi['request'])} />
      </AuthProvider>,
    );

    const team = await screen.findByRole('article', { name: teams[0].name });
    expect(await within(team).findByText(/student-18/)).toBeInTheDocument();
    expect(within(team).queryByRole('button', { name: '记录签到' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/checkins');
  });
  it('keeps draft roster controls but makes non-active check-ins and archived teams read-only', async () => {
    const manager = {
      ...captain,
      uid: 'sports-manager',
      tags: [],
      policies: [
        { action: 'sports.team.update', resource: 'sports_team', effect: 'allow' as const },
        { action: 'sports.checkin.read', resource: 'sports_checkin', effect: 'allow' as const },
        { action: 'sports.checkin.create', resource: 'sports_checkin', effect: 'allow' as const },
      ],
    };
    const stateTeams = [
      { ...teams[0], id: 'team-draft', name: 'Draft team', status: 'draft' },
      { ...teams[1], id: 'team-archived', name: 'Archived team', status: 'archived' },
    ];
    const request = vi.fn().mockImplementation((path: string) => {
      if (path === '/sports/teams') return Promise.resolve(stateTeams);
      if (path.endsWith('/members')) {
        return Promise.resolve(
          path.includes('archived')
            ? [{ id: 'member-old', memberUid: 'archived-member', isCaptain: false }]
            : [],
        );
      }
      if (path.endsWith('/checkins')) {
        return Promise.resolve([
          {
            id: `checkin-${path}`,
            teamId: path.includes('archived') ? 'team-archived' : 'team-draft',
            memberUid: path.includes('archived') ? 'archived-member' : 'draft-member',
            checkinDate: '2026-07-22',
            status: 'present',
          },
        ]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <AuthProvider client={authClient(manager)}>
        <SportsPage client={apiWith(request as DevelopmentApi['request'])} />
      </AuthProvider>,
    );

    const draft = await screen.findByRole('article', { name: 'Draft team' });
    expect(await within(draft).findByText(/draft-member/)).toBeInTheDocument();
    expect(within(draft).getByRole('button', { name: '添加成员' })).toBeInTheDocument();
    expect(within(draft).queryByRole('button', { name: '记录签到' })).not.toBeInTheDocument();

    const archived = screen.getByRole('article', { name: 'Archived team' });
    expect(
      within(within(archived).getByRole('list', { name: 'Archived team成员列表' })).getByText(
        /archived-member/,
      ),
    ).toBeInTheDocument();
    expect(within(archived).queryByRole('button', { name: '添加成员' })).not.toBeInTheDocument();
    expect(within(archived).queryByRole('button', { name: '授予队长' })).not.toBeInTheDocument();
    expect(within(archived).queryByRole('button', { name: '记录签到' })).not.toBeInTheDocument();
  });
  it('does not expose captain controls to an unscoped student', async () => {
    const student = {
      ...captain,
      uid: 'student-1',
      displayName: '普通同学',
      tags: [],
      policies: [],
    };
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

  it('previews and confirms a two-column CSV roster before refreshing members', async () => {
    const manager = {
      ...captain,
      uid: 'sports-manager',
      tags: [],
      policies: [
        {
          action: 'sports.*',
          resource: 'sports_team',
          effect: 'allow' as const,
          scope: { type: 'sports_team', id: 'team-basketball' },
        },
      ],
    };
    const header = '\u59d3\u540d,\u5b66\u53f7';
    const name = '\u5f20\u4e09';
    const csv = `${header}\n${name},20260001`;
    const preview = [
      {
        row: 2,
        name,
        studentNumber: '20260001',
        outcome: 'ready',
        blocking: false,
      },
    ];
    const request = vi
      .fn()
      .mockResolvedValueOnce([teams[0]])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ imported: 1, skipped: 0, rows: preview })
      .mockResolvedValueOnce([{ id: 'member-imported', memberUid: '20260001', isCaptain: false }]);
    const user = userEvent.setup();

    render(
      <AuthProvider client={authClient(manager)}>
        <SportsPage client={apiWith(request as DevelopmentApi['request'])} />
      </AuthProvider>,
    );

    const team = await screen.findByRole('article', { name: teams[0].name });
    const input = within(team).getByLabelText(
      '\u9009\u62e9\u540d\u5355 CSV\uff08\u59d3\u540d,\u5b66\u53f7\uff09',
    );
    await user.upload(input, new File([csv], 'roster.csv', { type: 'text/csv' }));

    expect(await within(team).findByText('20260001')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/roster-import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv,
    });
    await user.click(
      within(team).getByRole('button', {
        name: '\u786e\u8ba4\u5bfc\u5165',
      }),
    );

    expect(request).toHaveBeenCalledWith('/sports/teams/team-basketball/roster-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ row: 2, name, studentNumber: '20260001', outcome: 'ready' }],
      }),
    });
    expect(await within(team).findByText('20260001')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('\u540d\u5355\u5bfc\u5165\u5b8c\u6210');
  });
});
