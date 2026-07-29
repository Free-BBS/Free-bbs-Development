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
              occursAt: '2026-08-20T10:00:00.000Z',
              title: '主持人推送',
              type: 'promotion',
              description: '发布推送。',
              completed: true,
              displayOrder: 1,
            },
            {
              id: 'milestone-2',
              occursAt: '2026-09-01T10:00:00.000Z',
              title: '初赛',
              type: 'competition',
              description: '进行初赛。',
              completed: false,
              displayOrder: 2,
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
    expect(screen.getByRole('progressbar', { name: '活动筹备进度' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    const timeline = screen.getByRole('list', { name: '活动时间线' });
    expect(within(timeline).getByText('主持人推送')).toBeInTheDocument();
    expect(within(timeline).getByText('初赛')).toBeInTheDocument();
    const fixtures = screen.getByRole('table', { name: '比赛预览' });
    expect(within(fixtures).getByText('电子系 vs 自动化系')).toBeInTheDocument();
  });
});
