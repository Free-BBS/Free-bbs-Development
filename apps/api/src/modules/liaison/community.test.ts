import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

describe('liaison problem community', () => {
  it('keeps multiple teams and adopted outcomes active without closing the problem', async () => {
    const store = createMemoryStore();
    const app = createApp({
      store,
      databaseMode: 'memory',
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-student', 'demo-captain', 'demo-liaison-member']),
    });
    const problemId = 'liaison-problem-lab-energy';

    const thirdTeam = await request(app)
      .post(`/api/development/v1/liaison/problems/${problemId}/teams`)
      .set('X-Demo-User', 'demo-student')
      .send({ name: 'Third team', proposal: 'An independent approach.' })
      .expect(201);
    const teams = await request(app)
      .get(`/api/development/v1/liaison/problems/${problemId}/teams`)
      .set('X-Demo-User', 'demo-student')
      .expect(200);
    expect(teams.body.data.map(({ id }: { id: string }) => id)).toEqual(
      expect.arrayContaining([
        'liaison-team-energy-story',
        'liaison-team-energy-map',
        thirdTeam.body.data.id,
      ]),
    );

    const submitted = await request(app)
      .post(`/api/development/v1/liaison/problems/${problemId}/outcomes`)
      .set('X-Demo-User', 'demo-student')
      .send({
        teamId: thirdTeam.body.data.id,
        title: 'Independent result',
        description: 'A second adoptable result.',
        linkUrl: null,
        attachmentRef: null,
      })
      .expect(201);
    await request(app)
      .patch(`/api/development/v1/liaison/problems/${problemId}/outcomes/${submitted.body.data.id}`)
      .set('X-Demo-User', 'demo-liaison-member')
      .send({ status: 'adopted' })
      .expect(200);

    expect(await store.liaisonProblems.get(problemId)).toMatchObject({ status: 'open' });
    expect(
      (await store.liaisonOutcomes.list({ query: problemId })).filter(
        ({ status }) => status === 'adopted',
      ),
    ).toHaveLength(2);
  });
});
