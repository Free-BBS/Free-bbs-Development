import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';
import type { AuthorizationContext } from '../../core/authorization/policy.js';
import type { ScopeRef } from '@freebbs-development/contracts';
import type {
  DevelopmentStore,
  LiaisonOutcomeRecord,
  LiaisonPostRecord,
  LiaisonProblemRecord,
  LiaisonProblemStatus,
  LiaisonTeamMemberRecord,
  LiaisonTeamRecord,
  Page,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';
import { canTransition } from '../../core/workflow/state-machine.js';

export const PROBLEM_TRANSITIONS = {
  draft: ['pending_review'],
  pending_review: ['open', 'rejected'],
  rejected: ['draft'],
  open: ['paused', 'closed'],
  paused: ['open', 'closed'],
  closed: ['archived'],
  archived: [],
} as const;

const publicScope = { type: 'public', id: '*' } as const;
const publicStatuses = new Set<LiaisonProblemStatus>(['open', 'paused', 'closed']);

export interface ProblemCreateInput {
  title: string;
  summary: string;
  background: string;
  sourceType: LiaisonProblemRecord['sourceType'];
  sourceName: string;
  tags: string[];
  expectedOutcome: string;
  constraints: string;
  startsAt: string | null;
  deadline: string | null;
  publicContact: string;
  internalContactNote: string;
}

export type ProblemPatch = Partial<ProblemCreateInput>;
export interface ProblemListInput {
  query?: string;
  status?: LiaisonProblemStatus;
  tag?: string;
  page?: number;
  pageSize?: number;
}
export interface TeamCreateInput {
  name: string;
  proposal: string;
}
export interface PostCreateInput {
  teamId: string | null;
  kind: LiaisonPostRecord['kind'];
  body: string;
}
export interface OutcomeCreateInput {
  teamId: string;
  title: string;
  description: string;
  linkUrl: string | null;
  attachmentRef: string | null;
}

export type ProblemProjection = Omit<LiaisonProblemRecord, 'internalContactNote' | 'reviewNote'> & {
  internalContactNote?: string;
  reviewNote?: string | null;
};
export type TeamProjection = LiaisonTeamRecord & { members: LiaisonTeamMemberRecord[] };

function permitted(
  actor: AuthorizationContext,
  action: string,
  resource: 'liaison_problem' | 'liaison_outcome',
  scope: ScopeRef,
): boolean {
  return authorize(actor, { action, resource, scope }).allowed;
}

function problemScope(problemId: string): ScopeRef {
  return { type: 'liaison_problem', id: problemId };
}

function teamScope(teamId: string): ScopeRef {
  return { type: 'liaison_team', id: teamId };
}

function outcomeScope(outcomeId: string): ScopeRef {
  return { type: 'liaison_outcome', id: outcomeId };
}

function problemNotFound(): HttpError {
  return new HttpError(404, 'liaison_problem_not_found', 'Liaison problem not found');
}

function teamNotFound(): HttpError {
  return new HttpError(404, 'liaison_team_not_found', 'Liaison team not found');
}

function outcomeNotFound(): HttpError {
  return new HttpError(404, 'liaison_outcome_not_found', 'Liaison outcome not found');
}

function problemNotOpen(): HttpError {
  return new HttpError(409, 'liaison_problem_not_open', 'Liaison problem is not open');
}

function problemNotAcceptingOutcomes(): HttpError {
  return new HttpError(
    409,
    'problem_not_accepting_outcomes',
    'Liaison problem is not accepting outcomes',
  );
}

function teamInactive(): HttpError {
  return new HttpError(409, 'liaison_team_inactive', 'Liaison team is inactive');
}

function membershipNotPending(): HttpError {
  return new HttpError(409, 'team_membership_not_pending', 'Team membership is not pending');
}

function outcomeNotSubmitted(): HttpError {
  return new HttpError(409, 'liaison_outcome_not_submitted', 'Liaison outcome is not submitted');
}

async function actorIsActive(store: DevelopmentStore, uid: string): Promise<boolean> {
  return (await store.subjects.listForUpdate({ query: uid })).some(
    (subject) => subject.uid === uid && subject.status === 'active',
  );
}

function hasMaintenanceAccess(actor: AuthorizationContext, problem: LiaisonProblemRecord): boolean {
  return permitted(actor, 'liaison.problem.update', 'liaison_problem', problemScope(problem.id));
}

function hasSensitiveAccess(actor: AuthorizationContext, problem: LiaisonProblemRecord): boolean {
  return (
    problem.ownerUid === actor.uid ||
    hasMaintenanceAccess(actor, problem) ||
    permitted(actor, 'liaison.problem.review', 'liaison_problem', problemScope(problem.id))
  );
}

function canSee(actor: AuthorizationContext, problem: LiaisonProblemRecord): boolean {
  if (!permitted(actor, 'liaison.problem.read', 'liaison_problem', problemScope(problem.id)))
    return false;
  if (publicStatuses.has(problem.status)) return true;
  if (problem.ownerUid === actor.uid || hasMaintenanceAccess(actor, problem)) return true;
  return (
    problem.status === 'pending_review' &&
    permitted(actor, 'liaison.problem.review', 'liaison_problem', problemScope(problem.id))
  );
}

function project(actor: AuthorizationContext, problem: LiaisonProblemRecord): ProblemProjection {
  if (hasSensitiveAccess(actor, problem)) return problem;
  const { internalContactNote: _internal, reviewNote: _review, ...publicRecord } = problem;
  void _internal;
  void _review;
  return publicRecord;
}

function normalizeTime(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export class LiaisonProblemService {
  constructor(
    private readonly store: DevelopmentStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(
    actor: AuthorizationContext,
    input: ProblemListInput,
  ): Promise<Page<ProblemProjection>> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const filters = {
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.tag === undefined ? {} : { tag: input.tag }),
    };
    const firstVisibleIndex = (page - 1) * pageSize;
    const lastVisibleIndex = firstVisibleIndex + pageSize;
    const items: ProblemProjection[] = [];
    let visibleTotal = 0;
    let storagePage = 1;
    const storagePageSize = 100;
    let storageTotal = 0;
    do {
      const records = await this.store.liaisonProblems.page(filters, {
        page: storagePage,
        pageSize: storagePageSize,
      });
      storageTotal = records.total;
      for (const problem of records.items) {
        if (!canSee(actor, problem)) continue;
        if (visibleTotal >= firstVisibleIndex && visibleTotal < lastVisibleIndex) {
          items.push(project(actor, problem));
        }
        visibleTotal += 1;
      }
      storagePage += 1;
    } while ((storagePage - 1) * storagePageSize < storageTotal);
    return {
      items,
      page,
      pageSize,
      total: visibleTotal,
    };
  }

  async get(actor: AuthorizationContext, id: string): Promise<ProblemProjection> {
    const problem = await this.store.liaisonProblems.get(id);
    if (problem === null || !canSee(actor, problem)) throw problemNotFound();
    return project(actor, problem);
  }

  async create(
    actor: AuthorizationContext,
    input: ProblemCreateInput,
  ): Promise<LiaisonProblemRecord> {
    return this.store.transaction(async (store) => {
      if (
        !(await actorIsActive(store, actor.uid)) ||
        !authorize(actor, {
          action: 'liaison.problem.create',
          resource: 'liaison_problem',
          scope: publicScope,
        }).allowed
      ) {
        throw new HttpError(403, 'forbidden', 'Liaison problem create permission is required');
      }
      const created = await store.liaisonProblems.create({
        ...input,
        startsAt: normalizeTime(input.startsAt),
        deadline: normalizeTime(input.deadline),
        recorderUid: actor.uid,
        reviewerUid: null,
        reviewedAt: null,
        reviewNote: null,
        status: 'draft',
        ownerUid: actor.uid,
        scope: publicScope,
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.created',
        resourceType: 'liaison_problem',
        resourceId: created.id,
        details: { sourceType: created.sourceType, status: created.status },
      });
      return created;
    });
  }

  async update(
    actor: AuthorizationContext,
    id: string,
    patch: ProblemPatch,
  ): Promise<LiaisonProblemRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.liaisonProblems.getForUpdate(id);
      if (
        current === null ||
        !(await actorIsActive(store, actor.uid)) ||
        !hasMaintenanceAccess(actor, current)
      )
        throw problemNotFound();
      const normalized = {
        ...patch,
        ...(patch.startsAt === undefined ? {} : { startsAt: normalizeTime(patch.startsAt) }),
        ...(patch.deadline === undefined ? {} : { deadline: normalizeTime(patch.deadline) }),
      };
      const updated = await store.liaisonProblems.update(id, normalized);
      if (updated === null) throw problemNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.updated',
        resourceType: 'liaison_problem',
        resourceId: id,
        details: { changedFields: Object.keys(patch).sort() },
      });
      return updated;
    });
  }

  async transition(
    actor: AuthorizationContext,
    id: string,
    to: LiaisonProblemStatus,
  ): Promise<LiaisonProblemRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.liaisonProblems.getForUpdate(id);
      if (current === null || !(await actorIsActive(store, actor.uid))) throw problemNotFound();
      const from = current.status;
      if (from === 'pending_review' && (to === 'open' || to === 'rejected')) {
        if (
          !permitted(actor, 'liaison.problem.review', 'liaison_problem', problemScope(current.id))
        ) {
          throw problemNotFound();
        }
        throw new HttpError(409, 'review_endpoint_required', 'Use the review endpoint');
      }
      const action =
        to === 'pending_review' ? 'liaison.problem.submit_review' : 'liaison.problem.update';
      if (!permitted(actor, action, 'liaison_problem', problemScope(current.id)))
        throw problemNotFound();
      if (!canTransition(PROBLEM_TRANSITIONS, from, to)) {
        throw new HttpError(
          409,
          'invalid_state_transition',
          'Invalid liaison problem state transition',
        );
      }
      const updated = await store.liaisonProblems.update(id, { status: to });
      if (updated === null) throw problemNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.status_changed',
        resourceType: 'liaison_problem',
        resourceId: id,
        details: { from, to },
      });
      return updated;
    });
  }

  async review(
    actor: AuthorizationContext,
    id: string,
    decision: 'approve' | 'reject',
    note: string | null,
  ): Promise<LiaisonProblemRecord> {
    return this.store.transaction(async (store) => {
      const current = await store.liaisonProblems.getForUpdate(id);
      if (
        current === null ||
        !(await actorIsActive(store, actor.uid)) ||
        !permitted(actor, 'liaison.problem.review', 'liaison_problem', problemScope(current.id))
      ) {
        throw problemNotFound();
      }
      if (current.status !== 'pending_review') {
        throw new HttpError(409, 'problem_already_reviewed', 'Problem is not pending review');
      }
      const to = decision === 'approve' ? 'open' : 'rejected';
      const reviewedAt = this.now().toISOString();
      const updated = await store.liaisonProblems.update(id, {
        status: to,
        reviewerUid: actor.uid,
        reviewedAt,
        reviewNote: note,
      });
      if (updated === null) throw problemNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.reviewed',
        resourceType: 'liaison_problem',
        resourceId: id,
        details: { decision, from: current.status, to, reviewedAt },
      });
      return updated;
    });
  }

  async listTeams(actor: AuthorizationContext, problemId: string): Promise<TeamProjection[]> {
    const problem = await this.requireVisibleProblem(actor, problemId);
    void problem;
    const teams = (await this.store.liaisonTeams.list({ query: problemId })).filter(
      (team) => team.problemId === problemId && team.status === 'active',
    );
    const members = (await this.store.liaisonTeamMembers.list({ query: problemId })).filter(
      (member) => member.problemId === problemId,
    );
    return teams.map((team) => ({
      ...team,
      members: members.filter(
        (member) =>
          member.teamId === team.id &&
          (member.status === 'active' || team.maintainerUid === actor.uid),
      ),
    }));
  }

  async createTeam(
    actor: AuthorizationContext,
    problemId: string,
    input: TeamCreateInput,
  ): Promise<TeamProjection> {
    return this.store.transaction(async (store) => {
      const problem = await store.liaisonProblems.getForUpdate(problemId);
      if (
        problem === null ||
        !(await actorIsActive(store, actor.uid)) ||
        !permitted(actor, 'liaison.problem.join', 'liaison_problem', problemScope(problemId))
      )
        throw problemNotFound();
      if (problem.status !== 'open') throw problemNotOpen();
      const team = await store.liaisonTeams.create({
        problemId,
        ...input,
        maintainerUid: actor.uid,
        status: 'active',
        ownerUid: actor.uid,
        scope: { type: 'liaison_problem', id: problemId },
      });
      const membership = await store.liaisonTeamMembers.create({
        problemId,
        teamId: team.id,
        memberUid: actor.uid,
        role: 'maintainer',
        joinedAt: this.now().toISOString(),
        status: 'active',
        ownerUid: actor.uid,
        scope: { type: 'liaison_team', id: team.id },
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.team_created',
        resourceType: 'liaison_team',
        resourceId: team.id,
        details: { problemId },
      });
      return { ...team, members: [membership] };
    });
  }

  async requestMembership(
    actor: AuthorizationContext,
    problemId: string,
    teamId: string,
  ): Promise<LiaisonTeamMemberRecord> {
    return this.store.transaction(async (store) => {
      const problem = await store.liaisonProblems.getForUpdate(problemId);
      const team = await store.liaisonTeams.getForUpdate(teamId);
      if (
        problem === null ||
        team === null ||
        team.problemId !== problemId ||
        !(await actorIsActive(store, actor.uid)) ||
        !permitted(actor, 'liaison.problem.join', 'liaison_problem', teamScope(teamId))
      )
        throw teamNotFound();
      if (problem.status !== 'open') throw problemNotOpen();
      if (team.status !== 'active') throw teamInactive();
      const existing = (await store.liaisonTeamMembers.listForUpdate({ query: problemId })).find(
        (member) =>
          member.problemId === problemId &&
          member.teamId === teamId &&
          member.memberUid === actor.uid,
      );
      if (existing !== undefined) {
        throw new HttpError(409, 'team_membership_exists', 'Team membership already exists');
      }
      const membership = await store.liaisonTeamMembers.create({
        problemId,
        teamId,
        memberUid: actor.uid,
        role: 'member',
        joinedAt: this.now().toISOString(),
        status: 'pending',
        ownerUid: actor.uid,
        scope: { type: 'liaison_team', id: teamId },
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.team_join_requested',
        resourceType: 'liaison_team_member',
        resourceId: membership.id,
        details: { problemId, teamId },
      });
      return membership;
    });
  }

  async confirmMembership(
    actor: AuthorizationContext,
    problemId: string,
    teamId: string,
    memberUid: string,
  ): Promise<LiaisonTeamMemberRecord> {
    return this.store.transaction(async (store) => {
      const problem = await store.liaisonProblems.getForUpdate(problemId);
      const team = await store.liaisonTeams.getForUpdate(teamId);
      if (
        problem === null ||
        team === null ||
        team.problemId !== problemId ||
        team.maintainerUid !== actor.uid ||
        !(await actorIsActive(store, actor.uid)) ||
        !permitted(actor, 'liaison.problem.join', 'liaison_problem', teamScope(teamId))
      ) {
        throw teamNotFound();
      }
      if (problem.status !== 'open') throw problemNotOpen();
      if (team.status !== 'active') throw teamInactive();
      const membership = (await store.liaisonTeamMembers.listForUpdate({ query: problemId })).find(
        (candidate) =>
          candidate.problemId === problemId &&
          candidate.teamId === teamId &&
          candidate.memberUid === memberUid,
      );
      if (membership === undefined) throw teamNotFound();
      if (membership.status !== 'pending') throw membershipNotPending();
      const updated = await store.liaisonTeamMembers.update(membership.id, { status: 'active' });
      if (updated === null) throw teamNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.team_join_confirmed',
        resourceType: 'liaison_team_member',
        resourceId: membership.id,
        details: { problemId, teamId },
      });
      return updated;
    });
  }

  async listPosts(actor: AuthorizationContext, problemId: string): Promise<LiaisonPostRecord[]> {
    await this.requireVisibleProblem(actor, problemId);
    return (await this.store.liaisonPosts.list({ query: problemId }))
      .filter(
        (post) =>
          post.problemId === problemId && post.hiddenAt === null && post.status === 'visible',
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
  }

  async createPost(
    actor: AuthorizationContext,
    problemId: string,
    input: PostCreateInput,
  ): Promise<LiaisonPostRecord> {
    return this.store.transaction(async (store) => {
      const problem = await store.liaisonProblems.getForUpdate(problemId);
      if (problem === null || !(await actorIsActive(store, actor.uid))) throw problemNotFound();
      if (input.kind === 'progress' && input.teamId === null) {
        throw new HttpError(400, 'team_required', 'Progress posts require a team');
      }
      if (input.teamId !== null) {
        const team = await store.liaisonTeams.getForUpdate(input.teamId);
        if (
          team === null ||
          team.problemId !== problemId ||
          !permitted(actor, 'liaison.problem.post', 'liaison_problem', teamScope(input.teamId))
        )
          throw teamNotFound();
        if (problem.status !== 'open') throw problemNotOpen();
        if (team.status !== 'active') throw teamInactive();
        const membership = (
          await store.liaisonTeamMembers.listForUpdate({ query: problemId })
        ).find(
          (candidate) =>
            candidate.problemId === problemId &&
            candidate.teamId === input.teamId &&
            candidate.memberUid === actor.uid &&
            candidate.status === 'active',
        );
        if (membership === undefined) throw teamNotFound();
      } else if (
        !permitted(actor, 'liaison.problem.post', 'liaison_problem', problemScope(problemId))
      ) {
        throw problemNotFound();
      } else if (problem.status !== 'open') {
        throw problemNotOpen();
      }
      const post = await store.liaisonPosts.create({
        problemId,
        ...input,
        authorUid: actor.uid,
        hiddenAt: null,
        hiddenByUid: null,
        status: 'visible',
        ownerUid: actor.uid,
        scope: { type: 'liaison_problem', id: problemId },
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.post_created',
        resourceType: 'liaison_post',
        resourceId: post.id,
        details: { problemId, kind: post.kind, teamId: post.teamId },
      });
      return post;
    });
  }

  async listOutcomes(
    actor: AuthorizationContext,
    problemId: string,
  ): Promise<LiaisonOutcomeRecord[]> {
    await this.requireVisibleProblem(actor, problemId);
    return (await this.store.liaisonOutcomes.list({ query: problemId })).filter(
      (outcome) => outcome.problemId === problemId,
    );
  }

  async submitOutcome(
    actor: AuthorizationContext,
    problemId: string,
    input: OutcomeCreateInput,
  ): Promise<LiaisonOutcomeRecord> {
    return this.store.transaction(async (store) => {
      const problem = await store.liaisonProblems.getForUpdate(problemId);
      const team = await store.liaisonTeams.getForUpdate(input.teamId);
      if (
        problem === null ||
        team === null ||
        team.problemId !== problemId ||
        !(await actorIsActive(store, actor.uid)) ||
        !permitted(
          actor,
          'liaison.problem.outcome.submit',
          'liaison_outcome',
          teamScope(input.teamId),
        )
      )
        throw teamNotFound();
      if (problem.status !== 'open' && problem.status !== 'paused')
        throw problemNotAcceptingOutcomes();
      if (team.status !== 'active') throw teamInactive();
      const member = (await store.liaisonTeamMembers.listForUpdate({ query: problemId })).find(
        (candidate) =>
          candidate.problemId === problemId &&
          candidate.teamId === input.teamId &&
          candidate.memberUid === actor.uid &&
          candidate.status === 'active',
      );
      if (member === undefined) throw teamNotFound();
      const versions = (await store.liaisonOutcomes.listForUpdate({ query: problemId }))
        .filter((outcome) => outcome.problemId === problemId && outcome.teamId === input.teamId)
        .map(({ version }) => version);
      const version = versions.length === 0 ? 1 : Math.max(...versions) + 1;
      const outcome = await store.liaisonOutcomes.create({
        problemId,
        ...input,
        version,
        submittedAt: this.now().toISOString(),
        adoptedAt: null,
        adoptedByUid: null,
        status: 'submitted',
        ownerUid: actor.uid,
        scope: { type: 'liaison_team', id: input.teamId },
      });
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.outcome_submitted',
        resourceType: 'liaison_outcome',
        resourceId: outcome.id,
        details: { problemId, teamId: input.teamId, version },
      });
      return outcome;
    });
  }

  async adoptOutcome(
    actor: AuthorizationContext,
    problemId: string,
    outcomeId: string,
  ): Promise<LiaisonOutcomeRecord> {
    return this.store.transaction(async (store) => {
      const problem = await store.liaisonProblems.getForUpdate(problemId);
      const outcome = await store.liaisonOutcomes.getForUpdate(outcomeId);
      if (outcome === null || outcome.problemId !== problemId) throw outcomeNotFound();
      const team = await store.liaisonTeams.getForUpdate(outcome.teamId);
      if (
        problem === null ||
        team === null ||
        team.problemId !== problemId ||
        !(await actorIsActive(store, actor.uid)) ||
        !permitted(
          actor,
          'liaison.problem.outcome.manage',
          'liaison_outcome',
          outcomeScope(outcomeId),
        )
      )
        throw outcomeNotFound();
      if (!publicStatuses.has(problem.status)) throw problemNotAcceptingOutcomes();
      if (team.status !== 'active') throw teamInactive();
      if (outcome.status === 'adopted' || outcome.adoptedAt !== null) {
        throw new HttpError(409, 'outcome_already_adopted', 'Outcome is already adopted');
      }
      if (outcome.status !== 'submitted') throw outcomeNotSubmitted();
      const adoptedAt = this.now().toISOString();
      const updated = await store.liaisonOutcomes.update(outcomeId, {
        status: 'adopted',
        adoptedAt,
        adoptedByUid: actor.uid,
      });
      if (updated === null) throw outcomeNotFound();
      await recordAuditEvent(store, {
        actorUid: actor.uid,
        action: 'liaison.problem.outcome_adopted',
        resourceType: 'liaison_outcome',
        resourceId: outcomeId,
        details: { problemId, teamId: outcome.teamId, version: outcome.version, adoptedAt },
      });
      return updated;
    });
  }

  private async requireVisibleProblem(
    actor: AuthorizationContext,
    problemId: string,
  ): Promise<LiaisonProblemRecord> {
    const problem = await this.store.liaisonProblems.get(problemId);
    if (problem === null || !canSee(actor, problem)) throw problemNotFound();
    return problem;
  }
}
