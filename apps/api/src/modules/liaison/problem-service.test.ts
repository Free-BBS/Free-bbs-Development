import { describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '../../core/authorization/policy.js';
import {
  ADMIN_PERMISSION_RULES,
  BASE_STUDENT_PERMISSIONS,
  ROLE_PERMISSION_CATALOG,
} from '../../core/authorization/permission-catalog.js';
import { createMemoryStore } from '../../core/database/memory-store.js';
import type { DevelopmentStore } from '../../core/database/types.js';
import { LiaisonProblemService } from './problem-service.js';

const publicScope = { type: 'public', id: '*' } as const;

function actor(uid: string, actions: readonly string[]): AuthorizationContext {
  return {
    uid,
    displayName: uid,
    avatarUrl: null,
    baseRole: 'student',
    roles: [],
    tags: [],
    policies: actions.map((action) => ({
      id: `${uid}-${action}`,
      action,
      resource: action.includes('.outcome.') ? 'liaison_outcome' : 'liaison_problem',
      effect: 'allow' as const,
    })),
  };
}

const maintainer = actor('demo-liaison-member', [
  'liaison.problem.read',
  'liaison.problem.create',
  'liaison.problem.update',
  'liaison.problem.submit_review',
  'liaison.problem.outcome.manage',
]);
const reviewer = actor('demo-tuanwei-lead', ['liaison.problem.read', 'liaison.problem.review']);
const student = actor('demo-student', [
  'liaison.problem.read',
  'liaison.problem.join',
  'liaison.problem.post',
  'liaison.problem.outcome.submit',
]);

async function draft(store: DevelopmentStore, ownerUid = 'demo-liaison-member') {
  return store.liaisonProblems.create({
    title: 'A real problem',
    summary: 'A concise public summary.',
    background: 'Public background',
    sourceType: 'lab',
    sourceName: 'Research lab',
    tags: ['data'],
    expectedOutcome: 'A working prototype',
    constraints: 'Use public data only',
    startsAt: null,
    deadline: null,
    publicContact: 'liaison@example.test',
    internalContactNote: 'private-person@example.test',
    recorderUid: ownerUid,
    reviewerUid: null,
    reviewedAt: null,
    reviewNote: null,
    status: 'draft',
    ownerUid,
    scope: publicScope,
  });
}

describe('liaison problem service', () => {
  it('binds review only to the configured development and Youth League leads', () => {
    expect(ROLE_PERMISSION_CATALOG['platform.super_admin']).toContainEqual({
      action: 'liaison.problem.review',
      resource: 'liaison_problem',
    });
    expect(ROLE_PERMISSION_CATALOG['affiliation.tuanwei_lead']).toContainEqual({
      action: 'liaison.problem.review',
      resource: 'liaison_problem',
    });
    expect(ROLE_PERMISSION_CATALOG['domain.liaison_lead']).not.toContainEqual(
      expect.objectContaining({ action: 'liaison.problem.review' }),
    );
    expect(ADMIN_PERMISSION_RULES).not.toContainEqual(
      expect.objectContaining({ action: 'liaison.problem.review' }),
    );
    expect(BASE_STUDENT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'liaison.problem.read' }),
        expect.objectContaining({ action: 'liaison.problem.join' }),
        expect.objectContaining({ action: 'liaison.problem.post' }),
        expect.objectContaining({ action: 'liaison.problem.outcome.submit' }),
      ]),
    );
  });

  it('requires liaison.problem.review rather than admin.manage', async () => {
    const store = createMemoryStore();
    const problem = await draft(store);
    await store.liaisonProblems.update(problem.id, { status: 'pending_review' });
    const service = new LiaisonProblemService(store, () => new Date('2026-09-14T08:00:00.000Z'));
    const adminOnly = actor('demo-admin', ['admin.manage']);

    await expect(
      service.review(adminOnly, problem.id, 'approve', 'Looks good'),
    ).rejects.toMatchObject({
      status: 404,
      code: 'liaison_problem_not_found',
    });
    await expect(
      service.review(reviewer, problem.id, 'approve', 'Looks good'),
    ).resolves.toMatchObject({
      status: 'open',
      reviewerUid: reviewer.uid,
      reviewedAt: '2026-09-14T08:00:00.000Z',
      reviewNote: 'Looks good',
    });
  });

  it('does not reveal a pending review through the generic transition route', async () => {
    const store = createMemoryStore();
    const problem = await draft(store);
    await store.liaisonProblems.update(problem.id, { status: 'pending_review' });

    await expect(
      new LiaisonProblemService(store).transition(student, problem.id, 'open'),
    ).rejects.toMatchObject({ status: 404, code: 'liaison_problem_not_found' });
  });

  it('lets exactly one reviewer decide a pending problem under concurrency', async () => {
    const store = createMemoryStore();
    const problem = await draft(store);
    await store.liaisonProblems.update(problem.id, { status: 'pending_review' });
    const service = new LiaisonProblemService(store);

    const results = await Promise.allSettled([
      service.review(reviewer, problem.id, 'approve', 'Approved'),
      service.review(actor('demo-admin', ['liaison.problem.review']), problem.id, 'reject', 'No'),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find(({ status }) => status === 'rejected');
    expect(rejection).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ status: 409, code: 'problem_already_reviewed' }),
    });
    expect(
      (await store.auditLogs.list({ query: problem.id })).filter(
        ({ action }) => action === 'liaison.problem.reviewed',
      ),
    ).toHaveLength(1);
  });

  it('rolls back review metadata when its audit write fails', async () => {
    const base = createMemoryStore();
    const problem = await draft(base);
    await base.liaisonProblems.update(problem.id, { status: 'pending_review' });
    const store: DevelopmentStore = {
      ...base,
      transaction: (operation) =>
        base.transaction((transactionStore) =>
          operation({
            ...transactionStore,
            auditLogs: {
              ...transactionStore.auditLogs,
              create: async () => {
                throw new Error('simulated audit failure');
              },
            },
          }),
        ),
    };

    await expect(
      new LiaisonProblemService(store).review(reviewer, problem.id, 'approve', 'ok'),
    ).rejects.toThrow('simulated audit failure');
    expect(await base.liaisonProblems.get(problem.id)).toMatchObject({
      status: 'pending_review',
      reviewerUid: null,
      reviewedAt: null,
      reviewNote: null,
    });
  });

  it('does not expose internal contacts, rejected notes, or unrelated drafts', async () => {
    const store = createMemoryStore();
    const own = await draft(store);
    const unrelated = await draft(store, 'demo-admin');
    const rejected = await draft(store, 'demo-admin');
    await store.liaisonProblems.update(rejected.id, {
      status: 'rejected',
      reviewerUid: reviewer.uid,
      reviewedAt: '2026-09-14T08:00:00.000Z',
      reviewNote: 'Private rejection explanation',
    });
    const open = await draft(store, 'demo-admin');
    await store.liaisonProblems.update(open.id, {
      status: 'open',
      reviewNote: 'Internal approval note',
    });
    const service = new LiaisonProblemService(store);

    const visible = await service.list(student, {});
    expect(visible.items.map(({ id }) => id)).toContain(open.id);
    expect(visible.items.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([own.id, unrelated.id, rejected.id]),
    );
    expect(JSON.stringify(visible)).not.toMatch(
      /private-person|Private rejection|Internal approval/i,
    );

    const ownerView = await service.get(maintainer, own.id);
    expect(ownerView).toMatchObject({ internalContactNote: 'private-person@example.test' });
  });

  it('returns stable conflicts for duplicate membership and repeated adoption while keeping the problem open', async () => {
    const store = createMemoryStore();
    const problem = await draft(store);
    await store.liaisonProblems.update(problem.id, { status: 'open' });
    const service = new LiaisonProblemService(store);
    const team = await service.createTeam(student, problem.id, {
      name: 'Team one',
      proposal: 'We will build a prototype.',
    });

    await expect(service.requestMembership(student, problem.id, team.id)).rejects.toMatchObject({
      status: 409,
      code: 'team_membership_exists',
    });

    const first = await service.submitOutcome(student, problem.id, {
      teamId: team.id,
      title: 'Prototype one',
      description: 'First usable result',
      linkUrl: null,
      attachmentRef: null,
    });
    const second = await service.submitOutcome(student, problem.id, {
      teamId: team.id,
      title: 'Prototype two',
      description: 'Second usable result',
      linkUrl: null,
      attachmentRef: null,
    });
    await service.adoptOutcome(maintainer, problem.id, first.id);
    await service.adoptOutcome(maintainer, problem.id, second.id);
    await expect(service.adoptOutcome(maintainer, problem.id, first.id)).rejects.toMatchObject({
      status: 409,
      code: 'outcome_already_adopted',
    });
    expect(await store.liaisonProblems.get(problem.id)).toMatchObject({ status: 'open' });
    expect(await store.liaisonOutcomes.list({ query: problem.id })).toEqual([
      expect.objectContaining({ id: second.id, status: 'adopted' }),
      expect.objectContaining({ id: first.id, status: 'adopted' }),
    ]);
  });

  it('allocates outcome versions inside the transaction', async () => {
    const store = createMemoryStore();
    const problem = await draft(store);
    await store.liaisonProblems.update(problem.id, { status: 'open' });
    const service = new LiaisonProblemService(store);
    const team = await service.createTeam(student, problem.id, {
      name: 'Versioned team',
      proposal: 'Submit iterative outcomes.',
    });
    const input = {
      teamId: team.id,
      title: 'Versioned result',
      description: 'Server allocated version.',
      linkUrl: null,
      attachmentRef: null,
    };

    const outcomes = await Promise.all([
      service.submitOutcome(student, problem.id, input),
      service.submitOutcome(student, problem.id, input),
    ]);

    expect(outcomes.map(({ version }) => version).sort()).toEqual([1, 2]);
  });

  it('stops accepting new outcomes after the liaison maintainer closes a problem', async () => {
    const store = createMemoryStore();
    const problem = await draft(store);
    await store.liaisonProblems.update(problem.id, { status: 'open' });
    const service = new LiaisonProblemService(store);
    const team = await service.createTeam(student, problem.id, {
      name: 'Closing team',
      proposal: 'Submit before close.',
    });
    await store.liaisonProblems.update(problem.id, { status: 'closed' });

    await expect(
      service.submitOutcome(student, problem.id, {
        teamId: team.id,
        title: 'Late result',
        description: 'This should not be accepted.',
        linkUrl: null,
        attachmentRef: null,
      }),
    ).rejects.toMatchObject({ status: 404, code: 'liaison_problem_not_found' });
  });
});
