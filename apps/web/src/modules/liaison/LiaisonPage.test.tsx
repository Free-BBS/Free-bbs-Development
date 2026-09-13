import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import type { ApiClient } from '../../core/api/client.js';
import { LiaisonPage } from './LiaisonPage.js';
import type { LiaisonProblem } from './model.js';

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
  summary: '把匿名化能耗指标转化为可理解的交互展示。',
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

const pendingProblem = {
  ...problem,
  id: 'problem-pending',
  title: '待审核校企课题',
  status: 'pending_review' as const,
};

function page(items: LiaisonProblem[] = [problem]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}

function renderPage(client: Pick<ApiClient, 'request'>, user: UserContext = student) {
  return render(
    <MemoryRouter>
      <LiaisonPage client={client} user={user} />
    </MemoryRouter>,
  );
}

describe('LiaisonPage', () => {
  it('renders source, status, tags, deadline, expected outcome and team count', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/liaison/problems?page=1&pageSize=20') return page();
      if (path === '/liaison/problems/problem-energy/teams') {
        return [{ id: 'team-a' }, { id: 'team-b' }];
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderPage({ request } as Pick<ApiClient, 'request'>);

    expect(await screen.findByRole('heading', { name: '真实问题揭榜' })).toBeInTheDocument();
    const card = screen.getByRole('article', { name: problem.title });
    expect(card).toHaveTextContent('课题组 · 校园计算实验室');
    expect(card).toHaveTextContent('进行中');
    expect(card).toHaveTextContent('数据可视化');
    expect(card).toHaveTextContent('截止时间');
    expect(card).toHaveTextContent('可运行原型与设计说明。');
    expect(card).toHaveTextContent('2 个参与团队');
    expect(within(card).getByRole('link', { name: '查看课题' })).toHaveAttribute(
      'href',
      '/liaison/problems/problem-energy',
    );
  });

  it('uses explicit maintenance and review permissions instead of super-admin identity', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/liaison/problems?')) return page([pendingProblem]);
      if (path === '/liaison/problems/problem-pending/teams') return [];
      throw new Error(`Unexpected request: ${path}`);
    });
    const superAdmin = { ...student, uid: 'demo-admin', roles: ['platform.super_admin'] };
    const view = renderPage({ request } as Pick<ApiClient, 'request'>, superAdmin as UserContext);
    await screen.findByText(pendingProblem.title);
    expect(screen.queryByRole('button', { name: '代录问题' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '批准发布' })).not.toBeInTheDocument();

    const reviewer = {
      ...student,
      uid: 'reviewer',
      policies: [
        {
          action: 'liaison.problem.review',
          resource: 'liaison_problem',
          effect: 'allow' as const,
        },
      ],
    };
    view.rerender(
      <MemoryRouter>
        <LiaisonPage client={{ request } as Pick<ApiClient, 'request'>} user={reviewer} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: '批准发布' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '驳回修改' })).toBeInTheDocument();

    const maintainer = {
      ...student,
      uid: 'maintainer',
      policies: [
        {
          action: 'liaison.problem.create',
          resource: 'liaison_problem',
          effect: 'allow' as const,
        },
      ],
    };
    view.rerender(
      <MemoryRouter>
        <LiaisonPage client={{ request } as Pick<ApiClient, 'request'>} user={maintainer} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: '代录问题' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '批准发布' })).not.toBeInTheDocument();
  });

  it('validates proxy entry and keeps form data after a recoverable error', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/liaison/problems?') && init === undefined) return page([]);
      if (path === '/liaison/problems' && init?.method === 'POST') throw new Error('offline');
      throw new Error(`Unexpected request: ${path}`);
    });
    const maintainer = {
      ...student,
      policies: [
        { action: 'liaison.problem.create', resource: 'liaison_problem', effect: 'allow' as const },
      ],
    };
    const user = userEvent.setup();
    renderPage({ request } as Pick<ApiClient, 'request'>, maintainer);

    await user.click(await screen.findByRole('button', { name: '代录问题' }));
    await user.click(screen.getByRole('button', { name: '保存课题草稿' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请填写问题标题');

    await user.type(screen.getByLabelText('问题标题'), '无障碍页面检查');
    await user.type(screen.getByLabelText('简短摘要'), '制作轻量检查原型。');
    await user.type(screen.getByLabelText('背景说明'), '企业希望共同验证无障碍流程。');
    await user.type(screen.getByLabelText('来源名称'), '校企合作伙伴');
    await user.type(screen.getByLabelText('预期成果'), '检查清单与原型。');
    await user.type(screen.getByLabelText('公开对接方式'), '联络中心公开咨询台');
    await user.click(screen.getByRole('button', { name: '保存课题草稿' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
    expect(screen.getByLabelText('问题标题')).toHaveValue('无障碍页面检查');
  });

  it('ignores a stale board response after the active user changes', async () => {
    let resolveOld: ((value: ReturnType<typeof page>) => void) | undefined;
    const old = new Promise<ReturnType<typeof page>>((resolve) => {
      resolveOld = resolve;
    });
    const newProblem = { ...problem, id: 'problem-new', title: '新身份可见课题' };
    let listCalls = 0;
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/liaison/problems?')) {
        listCalls += 1;
        return listCalls === 1 ? old : page([newProblem]);
      }
      if (path === '/liaison/problems/problem-new/teams') return [];
      if (path === '/liaison/problems/problem-energy/teams') return [];
      throw new Error(`Unexpected request: ${path}`);
    });
    const view = renderPage({ request } as Pick<ApiClient, 'request'>, student);
    view.rerender(
      <MemoryRouter>
        <LiaisonPage
          client={{ request } as Pick<ApiClient, 'request'>}
          user={{ ...student, uid: 'another-student' }}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(newProblem.title)).toBeInTheDocument();
    resolveOld?.(page());
    await Promise.resolve();
    expect(screen.queryByText(problem.title)).not.toBeInTheDocument();
  });
});
