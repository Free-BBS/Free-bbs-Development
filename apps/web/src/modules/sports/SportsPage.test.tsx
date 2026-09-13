import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SportsPage, type DevelopmentApi, type SportsUser } from './SportsPage.js';

const teams = [
  {
    id: 'team-basketball',
    name: '篮球队',
    description: '院篮球代表队。',
    season: '2026 秋季',
    trainingSchedule: '每周二 18:00，篮球馆',
    status: 'active',
    ownerUid: 'sports-lead',
    scope: { type: 'sports_team', id: 'team-basketball' },
  },
];

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

describe('SportsPage', () => {
  it('keeps the directory concise and links each team to its detail route', async () => {
    const request = vi.fn().mockResolvedValue(teams);

    render(
      <MemoryRouter>
        <SportsPage client={{ request } as DevelopmentApi} user={sportsUser('student-1')} />
      </MemoryRouter>,
    );

    const card = await screen.findByRole('article', { name: /篮球队/ });
    expect(card).toHaveTextContent('2026 秋季');
    expect(card).toHaveTextContent('每周二 18:00，篮球馆');
    expect(card).toHaveTextContent('院篮球代表队。');
    expect(card).toHaveTextContent('活跃');
    expect(screen.getByRole('link', { name: '查看队伍详情' })).toHaveAttribute(
      'href',
      '/sports/team-basketball',
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/sports/teams');
    expect(request.mock.calls.flat().join(' ')).not.toContain('/members');
    expect(request.mock.calls.flat().join(' ')).not.toContain('/checkins');
  });
});
