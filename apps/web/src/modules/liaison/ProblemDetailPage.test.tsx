import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import type { ApiClient } from '../../core/api/client.js';
import type { LiaisonProblem } from './model.js';
import { ProblemDetailPage } from './ProblemDetailPage.js';

const student: UserContext = {
  uid: 'demo-student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
};

const problem: LiaisonProblem = {
  id: 'problem-energy',
  title: '校园能耗数据可视化',
  summary: '把匿名化能耗指标转化为交互展示。',
  background: '课题组希望验证校园数据叙事方案。',
  sourceType: 'lab' as const,
  sourceName: '校园计算实验室',
  tags: ['数据可视化', '前端'],
  expectedOutcome: '可运行原型与设计说明。',
  constraints: '只使用匿名化数据。',
  startsAt: '2026-10-01T00:00:00.000Z',
  deadline: '2026-11-15T00:00:00.000Z',
  publicContact: '联络中心公开咨询台',
  recorderUid: 'demo-liaison-member',
  reviewerUid: 'demo-tuanwei-lead',
  reviewedAt: '2026-09-20T08:00:00.000Z',
  status: 'open' as const,
  ownerUid: 'demo-liaison-member',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-09-18T08:00:00.000Z',
  updatedAt: '2026-09-20T08:00:00.000Z',
};

const member = {
  id: 'member-story',
  problemId: problem.id,
  teamId: 'team-story',
  memberUid: 'demo-student',
  role: 'maintainer',
  joinedAt: '2026-10-02T08:00:00.000Z',
  status: 'active',
  ownerUid: 'demo-student',
  scope: { type: 'liaison_team', id: 'team-story' },
  createdAt: '2026-10-02T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

const teams = [
  {
    id: 'team-story',
    problemId: problem.id,
    name: '数据叙事队',
    proposal: '先建立指标卡片，再制作趋势视图。',
    maintainerUid: 'demo-student',
    status: 'active',
    ownerUid: 'demo-student',
    scope: { type: 'liaison_problem', id: problem.id },
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T08:00:00.000Z',
    members: [member],
  },
];

const posts = [
  {
    id: 'post-later',
    problemId: problem.id,
    teamId: 'team-story',
    authorUid: 'demo-student',
    kind: 'progress',
    body: '已完成指标卡片草图。',
    status: 'visible',
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T08:00:00.000Z',
  },
  {
    id: 'post-earlier',
    problemId: problem.id,
    teamId: null,
    authorUid: 'demo-captain',
    kind: 'discussion',
    body: '样例数据有哪些时间粒度？',
    status: 'visible',
    createdAt: '2026-10-03T08:00:00.000Z',
    updatedAt: '2026-10-03T08:00:00.000Z',
  },
];

const outcomes = [
  {
    id: 'outcome-v1',
    problemId: problem.id,
    teamId: 'team-story',
    version: 1,
    title: '能耗指标叙事原型',
    description: '包含指标卡片和趋势解释。',
    linkUrl: 'https://example.invalid/outcome',
    attachmentRef: null,
    submittedAt: '2026-10-20T08:00:00.000Z',
    adoptedAt: null,
    adoptedByUid: null,
    status: 'submitted',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
  },
];

function clientFor(detail: LiaisonProblem = problem) {
  return {
    request: vi.fn(async (path: string, _init?: RequestInit): Promise<unknown> => {
      void _init;
      if (path === `/liaison/problems/${detail.id}`) return detail;
      if (path === `/liaison/problems/${detail.id}/teams`) return teams;
      if (path === `/liaison/problems/${detail.id}/posts`) return posts;
      if (path === `/liaison/problems/${detail.id}/outcomes`) return outcomes;
      throw new Error(`Unexpected request: ${path}`);
    }),
  };
}

function renderDetail(client: Pick<ApiClient, 'request'>, user: UserContext = student) {
  return render(
    <MemoryRouter>
      <ProblemDetailPage client={client} problemId={problem.id} user={user} />
    </MemoryRouter>,
  );
}

describe('ProblemDetailPage', () => {
  it('renders four sections and orders progress entries with newest last', async () => {
    expect(JSON.stringify(problem)).not.toContain('internalContact');
    renderDetail(
      clientFor({ ...problem, internalContactNote: '私人手机 13000000000' }) as Pick<
        ApiClient,
        'request'
      >,
    );

    expect(await screen.findByRole('heading', { name: problem.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '课题简介' })).toBeInTheDocument();
    expect(screen.getByText(problem.background)).toBeInTheDocument();
    expect(screen.getByText(problem.constraints)).toBeInTheDocument();
    expect(screen.getByText(problem.publicContact)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '并行团队' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: '参与课题的团队' })).getByText('数据叙事队'),
    ).toBeInTheDocument();
    const discussion = screen.getByRole('list', { name: '课题进度讨论' });
    expect(
      within(discussion)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('样例数据有哪些时间粒度？'),
      expect.stringContaining('已完成指标卡片草图。'),
    ]);
    expect(screen.getByRole('heading', { name: '成果版本' })).toBeInTheDocument();
    expect(screen.getByText('能耗指标叙事原型')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '参与课题' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布讨论' })).toBeInTheDocument();
    expect(screen.queryByText(/私人手机/)).not.toBeInTheDocument();
  });

  it('lets an explicit maintainer submit a draft for review', async () => {
    const draft = { ...problem, status: 'draft' as const };
    const activeClient = clientFor(draft);
    activeClient.request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/liaison/problems/${problem.id}/transitions` && init?.method === 'POST') {
        return { ...draft, status: 'pending_review' };
      }
      if (path === `/liaison/problems/${problem.id}`) return draft;
      if (path.includes('/teams') || path.includes('/posts') || path.includes('/outcomes'))
        return [];
      throw new Error(`Unexpected request: ${path}`);
    });
    const maintainer = {
      ...student,
      policies: [
        {
          action: 'liaison.problem.submit_review',
          resource: 'liaison_problem',
          effect: 'allow' as const,
        },
      ],
    };
    const user = userEvent.setup();
    renderDetail(activeClient as Pick<ApiClient, 'request'>, maintainer);

    await user.click(await screen.findByRole('button', { name: '提交审核' }));
    expect(activeClient.request).toHaveBeenCalledWith(
      `/liaison/problems/${problem.id}/transitions`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ to: 'pending_review' }) }),
    );
    expect(await screen.findByText('待审核')).toBeInTheDocument();
  });

  it('creates a team and posts a discussion after validation', async () => {
    const activeClient = clientFor();
    activeClient.request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/liaison/problems/${problem.id}/teams` && init?.method === 'POST') {
        return { ...teams[0], id: 'team-new', name: '新队伍', proposal: '先调研再实现。' };
      }
      if (path === `/liaison/problems/${problem.id}/posts` && init?.method === 'POST') {
        return {
          ...posts[1],
          id: 'post-new',
          body: '我们建议先确认样例数据。',
          createdAt: '2026-10-06T08:00:00.000Z',
        };
      }
      if (path === `/liaison/problems/${problem.id}`) return problem;
      if (path === `/liaison/problems/${problem.id}/teams`) return teams;
      if (path === `/liaison/problems/${problem.id}/posts`) return posts;
      if (path === `/liaison/problems/${problem.id}/outcomes`) return outcomes;
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    renderDetail(activeClient as Pick<ApiClient, 'request'>);

    await user.click(await screen.findByRole('button', { name: '参与课题' }));
    await user.click(screen.getByRole('button', { name: '创建并参与团队' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请填写团队名称和简短方案');
    await user.type(screen.getByLabelText('团队名称'), '新队伍');
    await user.type(screen.getByLabelText('简短方案'), '先调研再实现。');
    await user.click(screen.getByRole('button', { name: '创建并参与团队' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已创建团队并参与课题');
    expect(activeClient.request).toHaveBeenCalledWith(
      `/liaison/problems/${problem.id}/teams`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '新队伍', proposal: '先调研再实现。' }),
      }),
    );

    await user.type(screen.getByLabelText('讨论内容'), '我们建议先确认样例数据。');
    await user.click(screen.getByRole('button', { name: '发布讨论' }));
    expect(await screen.findByText('我们建议先确认样例数据。')).toBeInTheDocument();
    expect(activeClient.request).toHaveBeenCalledWith(
      `/liaison/problems/${problem.id}/posts`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          teamId: null,
          kind: 'discussion',
          body: '我们建议先确认样例数据。',
        }),
      }),
    );
  });

  it('shows review actions only for explicit review permission on pending items', async () => {
    const pending = { ...problem, status: 'pending_review' as const };
    const superAdmin = { ...student, roles: ['platform.super_admin'] } as UserContext;
    const view = renderDetail(clientFor(pending) as Pick<ApiClient, 'request'>, superAdmin);
    await screen.findByRole('heading', { name: problem.title });
    expect(screen.queryByRole('button', { name: '批准发布' })).not.toBeInTheDocument();

    const explicitReviewer = {
      ...student,
      uid: 'reviewer',
      policies: [
        { action: 'liaison.problem.review', resource: 'liaison_problem', effect: 'allow' as const },
      ],
    };
    view.rerender(
      <MemoryRouter>
        <ProblemDetailPage
          client={clientFor(pending) as Pick<ApiClient, 'request'>}
          problemId={problem.id}
          user={explicitReviewer}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: '批准发布' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '驳回修改' })).toBeInTheDocument();

    view.rerender(
      <MemoryRouter>
        <ProblemDetailPage
          client={clientFor() as Pick<ApiClient, 'request'>}
          problemId={problem.id}
          user={explicitReviewer}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('进行中')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '批准发布' })).not.toBeInTheDocument();
  });

  it('ignores stale detail data after the route changes', async () => {
    let resolveOld: ((value: typeof problem) => void) | undefined;
    const old = new Promise<typeof problem>((resolve) => {
      resolveOld = resolve;
    });
    const next = { ...problem, id: 'problem-next', title: '新路由课题' };
    const request = vi.fn(async (path: string) => {
      if (path === `/liaison/problems/${problem.id}`) return old;
      if (path === `/liaison/problems/${next.id}`) return next;
      if (path.includes('/teams') || path.includes('/posts') || path.includes('/outcomes'))
        return [];
      throw new Error(`Unexpected request: ${path}`);
    });
    const view = renderDetail({ request } as Pick<ApiClient, 'request'>);
    view.rerender(
      <MemoryRouter>
        <ProblemDetailPage
          client={{ request } as Pick<ApiClient, 'request'>}
          problemId={next.id}
          user={student}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: next.title })).toBeInTheDocument();
    resolveOld?.(problem);
    await Promise.resolve();
    expect(screen.queryByRole('heading', { name: problem.title })).not.toBeInTheDocument();
  });
});
