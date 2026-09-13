import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ActivityDetailPage, type DevelopmentApi } from './ActivityDetailPage.js';

const student = {
  uid: 'demo-student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student' as const,
  roles: [],
  tags: [],
  policies: [],
};
const maintainer = {
  ...student,
  policies: [
    { id: 'update', action: 'events.update', resource: 'activity', effect: 'allow' as const },
  ],
};

describe('ActivityDetailPage', () => {
  it('renders time, location, timeline progress, and competition fixtures', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/events/activities/activity-ma') {
        return {
          id: 'activity-ma',
          title: '马约翰杯',
          description: '校级体育赛事。',
          status: 'published',
          startsAt: '2026-09-12T08:00:00.000Z',
          endsAt: '2026-09-12T18:00:00.000Z',
          location: '东大操场',
          registrationDeadline: '2026-09-10T12:00:00.000Z',
          capacity: 64,
          contact: 'sports@example.edu.cn',
          organizationId: 'sports_center',
          standingActivity: true,
          clubId: null,
          ownerUid: 'sports-owner',
          scope: { type: 'public', id: '*' },
          technicalSupportStatus: 'confirmed',
          technicalSupportNote: null,
          progress: { completed: 1, total: 2, percentage: 50 },
          milestones: [
            {
              id: 'milestone-1',
              occursAt: '2026-09-20T10:00:00.000Z',
              title: '主持人推送',
              type: 'promotion',
              description: '发布推送。',
              completed: true,
              displayOrder: 2,
            },
            {
              id: 'milestone-2',
              occursAt: '2026-09-01T10:00:00.000Z',
              title: '初赛',
              type: 'competition',
              description: '进行初赛。',
              completed: false,
              displayOrder: 1,
            },
          ],
          fixtures: [
            {
              id: 'fixture-1',
              round: '小组赛',
              participantA: '电子系',
              participantB: '自动化系',
              scheduledAt: '2026-09-12T11:00:00.000Z',
              location: '东大操场',
              score: null,
            },
          ],
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter basename="/development" initialEntries={['/development/events/activity-ma']}>
        <ActivityDetailPage
          activityId="activity-ma"
          client={{ request: request as DevelopmentApi['request'] }}
          user={student}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '马约翰杯' })).toBeInTheDocument();
    expect(screen.getAllByText('东大操场')).toHaveLength(2);
    expect(screen.getByText('报名截止')).toBeInTheDocument();
    expect(screen.getByText('64 人')).toBeInTheDocument();
    expect(screen.getByText('sports@example.edu.cn')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '活动筹备进度' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    const timeline = screen.getByRole('list', { name: '活动时间线' });
    expect(
      within(timeline)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('初赛'), expect.stringContaining('主持人推送')]);
    const fixtures = screen.getByRole('table', { name: '比赛预览' });
    expect(within(fixtures).getByText('电子系 vs 自动化系')).toBeInTheDocument();
  });

  it('shows the empty-flow state and only exposes maintenance controls to scoped maintainers', async () => {
    const request = vi.fn(async (path: string) => {
      if (path !== '/events/activities/activity-empty')
        throw new Error(`Unexpected request: ${path}`);
      return {
        id: 'activity-empty',
        title: '社团招新',
        description: '面向全校同学的招新活动。',
        status: 'draft',
        startsAt: null,
        endsAt: null,
        location: '',
        registrationDeadline: null,
        capacity: null,
        contact: '',
        organizationId: null,
        standingActivity: false,
        clubId: null,
        ownerUid: 'sports-owner',
        scope: { type: 'public', id: '*' },
        milestones: [],
        fixtures: [],
        progress: null,
      };
    });

    const { rerender } = render(
      <MemoryRouter>
        <ActivityDetailPage
          activityId="activity-empty"
          client={{ request: request as DevelopmentApi['request'] }}
          user={student}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('尚未发布流程')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '维护活动流程' })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ActivityDetailPage
          activityId="activity-empty"
          client={{ request: request as DevelopmentApi['request'] }}
          user={maintainer}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: '维护活动流程' })).toBeInTheDocument();
  });
});
