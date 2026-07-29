import { describe, expect, it } from 'vitest';

import { createMemoryStore } from './memory-store.js';

const publicScope = { type: 'public', id: '*' } as const;

describe('platform content store contract', () => {
  it('persists proposals with separated public and internal progress', async () => {
    const store = createMemoryStore({ seed: false });
    const proposal = await store.proposals.create({
      title: '延长场馆开放时间',
      problemDescription: '晚间场地不足',
      proposedSolution: '试行延长开放一小时',
      category: 'campus_service',
      submitterUid: 'demo-student',
      assigneeUid: null,
      publicProgress: '已提交',
      internalNote: '等待负责人分派',
      status: 'submitted',
      ownerUid: 'demo-student',
      scope: publicScope,
    });

    expect(await store.proposals.get(proposal.id)).toMatchObject({
      title: '延长场馆开放时间',
      publicProgress: '已提交',
      internalNote: '等待负责人分派',
    });
  });

  it('persists ordered activity milestones and competition fixtures', async () => {
    const store = createMemoryStore({ seed: false });
    const milestone = await store.activityMilestones.create({
      activityId: 'activity-ma-yuehan',
      occursAt: '2026-10-01T08:00:00.000Z',
      title: '初赛',
      type: 'preliminary',
      description: '小组循环赛开始',
      completed: false,
      displayOrder: 2,
      status: 'scheduled',
      ownerUid: 'demo-sports-lead',
      scope: { type: 'social_organization', id: 'sports_center' },
    });
    const fixture = await store.competitionFixtures.create({
      activityId: 'activity-ma-yuehan',
      round: '小组赛',
      participantA: '电子系',
      participantB: '自动化系',
      scheduledAt: '2026-10-01T09:00:00.000Z',
      location: '东大操场',
      score: null,
      status: 'scheduled',
      ownerUid: 'demo-sports-lead',
      scope: { type: 'social_organization', id: 'sports_center' },
    });

    expect((await store.activityMilestones.get(milestone.id))?.displayOrder).toBe(2);
    expect((await store.competitionFixtures.get(fixture.id))?.participantB).toBe('自动化系');
  });
});
