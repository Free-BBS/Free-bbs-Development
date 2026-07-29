import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import type { ApiClient } from '../../core/api/client.js';
import { InformationPage } from './InformationPage.js';

const student: UserContext = {
  uid: 'proposal-student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
};

const rightsMember: UserContext & {
  policies: Array<{ action: string; effect: 'allow' }>;
} = {
  ...student,
  uid: 'rights-member',
  displayName: '权益发展中心部员',
  roles: ['department.rights_development_member'],
  tags: [
    {
      key: 'social_org.rights_development_center',
      scope: { type: 'social_organization', id: 'rights_development_center' },
    },
  ],
  policies: [{ action: 'information.proposal.manage', effect: 'allow' }],
};

const publicProposal = {
  id: 'proposal-1',
  title: '增加夜间自习空间',
  problemDescription: '考试周座位不足',
  proposedSolution: '延长公共教室开放时间',
  category: 'campus_service',
  submitterUid: 'proposal-student',
  assigneeUid: null,
  publicProgress: '已提交',
  status: 'submitted' as const,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
};

function proposalClient(maintenance = false) {
  const detail = maintenance ? { ...publicProposal, internalNote: '联系物业' } : publicProposal;
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path === '/information/announcements' || path === '/information/consultations') return [];
    if (path === '/information/proposals' && method === 'GET') return [publicProposal];
    if (path === `/information/proposals/${publicProposal.id}` && method === 'GET') return detail;
    if (path === '/information/proposals' && method === 'POST') return publicProposal;
    if (path === `/information/proposals/${publicProposal.id}` && method === 'PATCH') {
      return { ...detail, ...JSON.parse(String(init?.body)) };
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  return { request } as unknown as ApiClient;
}

describe('InformationPage proposal pool', () => {
  it('renders a public table and detail while allowing student submissions', async () => {
    const client = proposalClient();
    const actor = userEvent.setup();
    render(<InformationPage client={client} user={student} />);

    expect(await screen.findByRole('table', { name: '公开提案池' })).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: '查看 增加夜间自习空间' }));
    expect(await screen.findByRole('heading', { name: '增加夜间自习空间' })).toBeInTheDocument();
    expect(screen.getByText('考试周座位不足')).toBeInTheDocument();
    expect(screen.queryByLabelText('内部备注')).not.toBeInTheDocument();

    await actor.type(screen.getByLabelText('提案标题'), '增加夜间自习空间');
    await actor.type(screen.getByLabelText('问题描述'), '考试周座位不足');
    await actor.type(screen.getByLabelText('建议方案'), '延长公共教室开放时间');
    await actor.type(screen.getByLabelText('提案类别'), 'campus_service');
    await actor.click(screen.getByRole('button', { name: '提交提案' }));

    expect(client.request).toHaveBeenCalledWith(
      '/information/proposals',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows the maintenance editor only to Rights Development roles', async () => {
    const client = proposalClient(true);
    const actor = userEvent.setup();
    render(<InformationPage client={client} user={rightsMember} />);

    await screen.findByRole('table', { name: '公开提案池' });
    await actor.click(screen.getByRole('button', { name: '查看 增加夜间自习空间' }));

    expect(await screen.findByLabelText('内部备注')).toHaveValue('联系物业');
    await actor.clear(screen.getByLabelText('公开进展'));
    await actor.type(screen.getByLabelText('公开进展'), '已进入调研');
    await actor.selectOptions(screen.getByLabelText('提案状态'), 'reviewing');
    await actor.click(screen.getByRole('button', { name: '保存提案维护信息' }));

    expect(client.request).toHaveBeenCalledWith(
      '/information/proposals/proposal-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"status":"reviewing"'),
      }),
    );
  });
});
