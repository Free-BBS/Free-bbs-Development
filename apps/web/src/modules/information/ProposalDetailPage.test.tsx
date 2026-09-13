import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';
import type { ApiClient } from '../../core/api/client.js';
import { ProposalDetailPage } from './ProposalDetailPage.js';

const student: UserContext = {
  uid: 'proposal-student',
  displayName: '普通同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
};
const maintainer: UserContext & { policies: Array<{ action: string; effect: 'allow' }> } = {
  ...student,
  uid: 'rights-member',
  policies: [{ action: 'information.proposal.manage', effect: 'allow' }],
};
const publicProposal = {
  id: 'proposal-1',
  title: '增加夜间自习空间',
  problemDescription: '考试周座位不足',
  proposedSolution: '延长公共教室开放时间',
  category: 'campus_service',
  submitterUid: 'proposal-student',
  assigneeUid: 'rights-owner',
  dueAt: '2026-10-08T10:00:00.000Z',
  publicProgress: '已进入调研',
  status: 'researching',
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

function renderDetail(user: UserContext, response: object, request = vi.fn(async () => response)) {
  render(
    <MemoryRouter>
      <ProposalDetailPage
        client={{ request } as unknown as ApiClient}
        proposalId="proposal-1"
        user={user}
      />
    </MemoryRouter>,
  );
  return request;
}

describe('ProposalDetailPage', () => {
  it('renders a public progress timeline without exposing an unexpected internal note', async () => {
    renderDetail(student, { ...publicProposal, internalNote: '不得展示的内部事项' });

    expect(await screen.findByRole('heading', { name: '增加夜间自习空间' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '提案进展时间线' })).toHaveTextContent('调研中');
    expect(screen.getByRole('list', { name: '提案进展时间线' })).toHaveTextContent('rights-owner');
    expect(screen.getByRole('list', { name: '提案进展时间线' })).toHaveTextContent('2026-10-08');
    expect(screen.queryByText('不得展示的内部事项')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('提案维护抽屉')).not.toBeInTheDocument();
  });

  it('keeps maintenance controls in a right-side drawer for authorized maintainers', async () => {
    const request = renderDetail(maintainer, { ...publicProposal, internalNote: '联系物业' });
    const actor = userEvent.setup();

    await screen.findByRole('heading', { name: '增加夜间自习空间' });
    expect(screen.queryByRole('dialog', { name: '维护提案' })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: '维护提案' }));
    expect(await screen.findByRole('dialog', { name: '维护提案' })).toHaveTextContent('联系物业');
    await actor.selectOptions(screen.getByLabelText('提案状态'), 'advancing');
    await actor.click(screen.getByRole('button', { name: '保存提案维护信息' }));

    expect(request).toHaveBeenCalledWith(
      '/information/proposals/proposal-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"status":"advancing"'),
      }),
    );
  });
});
