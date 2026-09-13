import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ClubsPage, type DevelopmentApi } from './ClubsPage.js';

const group = {
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
  ],
};

describe('InterestGroupsPage', () => {
  it('shows public category and contact details but reserves the maintenance drawer for a scoped liaison policy', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/interest-groups') {
        return [
          {
            ...group,
            category: '运动健康',
            contactName: '跑团联络员',
            publicContact: 'run@example.test',
          },
        ];
      }
      if (path === '/events/activities') return [];
      if (path === '/interest-groups/club-running/memberships') return [];
      if (path === '/interest-groups' && init?.method === 'PATCH') return group;
      throw new Error(`Unexpected request: ${path}`);
    });
    const liaison = {
      ...student,
      policies: [
        ...student.policies,
        {
          id: 'liaison-maintain',
          action: 'clubs.update',
          resource: 'club',
          effect: 'allow' as const,
          scope: { type: 'public', id: '*' },
        },
      ],
    };
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter basename="/development" initialEntries={['/development/interest-groups']}>
        <ClubsPage client={{ request: request as DevelopmentApi['request'] }} user={student} />
      </MemoryRouter>,
    );
    const publicCard = await screen.findByRole('article', { name: group.name });
    expect(within(publicCard).getByText('运动健康')).toBeInTheDocument();
    expect(within(publicCard).getByText('跑团联络员 · run@example.test')).toBeInTheDocument();
    expect(
      within(publicCard).queryByRole('button', { name: `编辑${group.name}` }),
    ).not.toBeInTheDocument();

    rerender(
      <MemoryRouter basename="/development" initialEntries={['/development/interest-groups']}>
        <ClubsPage client={{ request: request as DevelopmentApi['request'] }} user={liaison} />
      </MemoryRouter>,
    );
    const liaisonCard = await screen.findByRole('article', { name: group.name });
    await user.click(within(liaisonCard).getByRole('button', { name: `编辑${group.name}` }));
    expect(screen.getByRole('dialog', { name: '编辑趣缘群体' })).toBeInTheDocument();
    expect(screen.getByLabelText('类别')).toHaveValue('运动健康');
    expect(screen.getByLabelText('公开联系人')).toHaveValue('run@example.test');
  });

  it('uses the canonical API and shows associated public activities', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/interest-groups') return [group];
      if (path === '/interest-groups/club-running/memberships') return [];
      if (path === '/events/activities') {
        return [
          {
            id: 'activity-night-run',
            title: '校园夜跑',
            description: '五公里轻松跑。',
            clubId: group.id,
            startsAt: '2026-09-12T19:00:00.000Z',
            status: 'published',
            scope: { type: 'public', id: '*' },
          },
          {
            id: 'activity-unrelated',
            title: '无关活动',
            description: '不应出现在该群体卡片。',
            clubId: null,
            startsAt: null,
            status: 'published',
            scope: { type: 'public', id: '*' },
          },
        ];
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter basename="/development" initialEntries={['/development/interest-groups']}>
        <ClubsPage client={{ request: request as DevelopmentApi['request'] }} user={student} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '趣缘群体' })).toBeInTheDocument();
    const card = await screen.findByRole('article', { name: group.name });
    expect(within(card).getByText('校园夜跑')).toBeInTheDocument();
    expect(within(card).queryByText('无关活动')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/interest-groups');
    expect(request).toHaveBeenCalledWith('/events/activities');
  });
});
