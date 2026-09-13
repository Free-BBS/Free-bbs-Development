import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ClubsPage, type DevelopmentApi } from './ClubsPage.js';

const club = {
  id: 'club-running',
  name: '自由跑团',
  description: '每周组织校园夜跑。',
  status: 'active' as const,
  technicalSupportStatus: 'not_requested' as const,
  technicalSupportNote: null,
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

function renderPage(client: DevelopmentApi, user: Parameters<typeof ClubsPage>[0]['user']) {
  return render(
    <MemoryRouter basename="/development" initialEntries={['/development/interest-groups']}>
      <ClubsPage client={client} user={user} />
    </MemoryRouter>,
  );
}

const student = {
  uid: 'demo-student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student' as const,
  roles: [],
  tags: [],
  policies: [
    { id: 'read', action: 'clubs.read', resource: 'club', effect: 'allow' as const },
    { id: 'join', action: 'clubs.join', resource: 'club_membership', effect: 'allow' as const },
    { id: 'leave', action: 'clubs.leave', resource: 'club_membership', effect: 'allow' as const },
  ],
};

const maintainer = {
  ...student,
  uid: 'maintainer',
  displayName: '社群维护者',
  policies: [
    ...student.policies,
    { id: 'create', action: 'clubs.create', resource: 'club', effect: 'allow' as const },
    {
      id: 'update',
      action: 'clubs.update',
      resource: 'club',
      effect: 'allow' as const,
      scope: { type: 'public', id: '*' },
    },
    {
      id: 'support',
      action: 'clubs.technical_support',
      resource: 'club',
      effect: 'allow' as const,
      scope: { type: 'public', id: '*' },
    },
  ],
};

describe('ClubsPage', () => {
  it('restores the current user membership from the server and preserves history after leaving', async () => {
    const user = userEvent.setup();
    let membershipStatus: 'pending' | 'left' = 'pending';
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/interest-groups') return [club];
      if (path === '/events/activities') return [];
      if (path === '/interest-groups/club-running/memberships' && init?.method === 'DELETE') {
        membershipStatus = 'left';
        return undefined;
      }
      if (path === '/interest-groups/club-running/memberships') {
        return [
          {
            id: 'membership-1',
            clubId: club.id,
            memberUid: 'demo-student',
            status: membershipStatus,
          },
        ];
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderPage({ request: request as DevelopmentApi['request'] }, student);
    const card = await screen.findByRole('article', { name: '自由跑团' });
    expect(await within(card).findByText('申请待审批')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '加入自由跑团' })).not.toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(within(card).getByRole('button', { name: '撤回自由跑团申请' }));
    expect(
      await within(card).findByRole('button', { name: '重新申请自由跑团' }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/interest-groups/club-running/memberships', {
      method: 'DELETE',
    });
  });

  it('shows scoped maintenance, membership, support controls and a basename-aware activity link', async () => {
    const user = userEvent.setup();
    const pending = {
      id: 'membership-2',
      clubId: club.id,
      memberUid: 'new-member',
      status: 'pending',
    };
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/interest-groups') return [club];
      if (path === '/events/activities')
        return [
          {
            id: 'activity-night-run',
            title: '校园夜跑',
            description: '五公里轻松跑。',
            clubId: club.id,
            startsAt: '2026-09-12T19:00:00.000Z',
            status: 'published',
          },
        ];
      if (path === '/interest-groups/club-running/memberships' && init === undefined)
        return [pending];
      if (path.includes('/memberships/membership-2')) return { ...pending, status: 'active' };
      if (path.endsWith('/transitions')) return { ...club, status: 'archived' };
      if (path.endsWith('/technical-support'))
        return { ...club, technicalSupportStatus: 'requested' };
      throw new Error(`Unexpected request: ${path}`);
    });

    renderPage({ request: request as DevelopmentApi['request'] }, maintainer);
    const card = await screen.findByRole('article', { name: '自由跑团' });
    expect(within(card).getByRole('button', { name: '编辑自由跑团' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '归档自由跑团' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '批准 new-member' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '校园夜跑' })).toHaveAttribute(
      'href',
      '/development/events',
    );

    await user.click(within(card).getByRole('button', { name: '批准 new-member' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/interest-groups/club-running/memberships/membership-2',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    await user.click(within(card).getByRole('button', { name: '申请自由跑团技术支持' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/interest-groups/club-running/technical-support',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });
  it('does not present an empty membership state when the membership request fails', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/interest-groups') return [club];
      if (path === '/events/activities') return [];
      if (path === '/interest-groups/club-running/memberships') throw new Error('会员服务不可用');
      throw new Error(`Unexpected request: ${path}`);
    });

    renderPage({ request: request as DevelopmentApi['request'] }, student);
    expect(await screen.findByRole('alert')).toHaveTextContent('会员服务不可用');
    expect(screen.queryByRole('button', { name: '加入自由跑团' })).not.toBeInTheDocument();
  });
});
