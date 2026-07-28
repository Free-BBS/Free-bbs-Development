import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancePage } from './FinancePage';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('../../core/api/client.js', () => ({
  createApiClient: () => ({ request: mockRequest }),
}));

const existingRecord = {
  id: 'finance-1',
  title: '社团年度预算',
  kind: 'budget',
  amountCents: 12345,
  activityId: null,
  status: 'submitted',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};
const financeLead = {
  uid: 'finance-lead',
  displayName: '财务负责人',
  avatarUrl: null,
  baseRole: 'student' as const,
  roles: [],
  tags: [],
  policies: [
    {
      id: 'create',
      action: 'finance.record.create',
      resource: 'finance_record',
      effect: 'allow' as const,
    },
    {
      id: 'update',
      action: 'finance.record.update',
      resource: 'finance_record',
      effect: 'allow' as const,
    },
    {
      id: 'approve',
      action: 'finance.record.approve',
      resource: 'finance_record',
      effect: 'allow' as const,
    },
  ],
};

describe('FinancePage', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('displays integer-cent amounts and creates an exact-cent draft before refreshing', async () => {
    const created = {
      ...existingRecord,
      id: 'finance-2',
      title: '迎新活动预算',
      amountCents: 8850,
      status: 'draft',
    };
    mockRequest
      .mockResolvedValueOnce([existingRecord])
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce([existingRecord, created]);

    render(<FinancePage user={financeLead} />);

    expect(await screen.findByText('社团年度预算')).toBeInTheDocument();
    expect(screen.getByText('¥123.45')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('记录标题'), '迎新活动预算');
    await userEvent.clear(screen.getByLabelText('金额（元）'));
    await userEvent.type(screen.getByLabelText('金额（元）'), '88.50');
    await userEvent.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(3));
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      '/finance/records',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: '迎新活动预算',
          kind: 'budget',
          amountCents: 8850,
          activityId: null,
          status: 'draft',
          scope: { type: 'public', id: '*' },
        }),
      }),
    );
    expect(await screen.findByText('财务草稿已创建')).toBeInTheDocument();
    expect(screen.getByText('迎新活动预算')).toBeInTheDocument();
  });

  it('distinguishes empty, validation and restricted states', async () => {
    mockRequest.mockResolvedValueOnce([]);
    const { rerender } = render(<FinancePage user={financeLead} />);
    expect(await screen.findByText('暂无财务记录')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('记录标题'), '错误金额');
    await userEvent.clear(screen.getByLabelText('金额（元）'));
    await userEvent.type(screen.getByLabelText('金额（元）'), '1.999');
    await userEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(screen.getByRole('alert')).toHaveTextContent('金额最多保留两位小数');
    expect(mockRequest).toHaveBeenCalledTimes(1);

    mockRequest.mockReset();
    mockRequest.mockRejectedValueOnce({ status: 403, message: 'forbidden' });
    rerender(<FinancePage key="restricted" user={financeLead} />);
    expect(await screen.findByText('暂无财务访问权限')).toBeInTheDocument();
  });

  it('runs the complete lifecycle and preserves confirmed state after a failed write', async () => {
    type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';
    let current = { ...existingRecord, status: 'draft' as Status };
    let rejectArchive = true;
    mockRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/finance/records' && init === undefined) return [current];
      if (path === `/finance/records/${current.id}/transitions`) {
        const body = JSON.parse(String(init?.body)) as { to: Status };
        if (body.to === 'archived' && rejectArchive) throw new Error('archive rejected');
        current = { ...current, status: body.to };
        return current;
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<FinancePage user={financeLead} />);
    await userEvent.click(await screen.findByRole('button', { name: '提交审批' }));
    await userEvent.click(await screen.findByRole('button', { name: '驳回' }));
    await userEvent.click(await screen.findByRole('button', { name: '退回草稿' }));
    await userEvent.click(await screen.findByRole('button', { name: '提交审批' }));
    await userEvent.click(await screen.findByRole('button', { name: '批准' }));
    await waitFor(() => expect(current.status).toBe('approved'));

    await userEvent.click(await screen.findByRole('button', { name: '归档' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('页面保留服务端已确认状态');
    expect(current.status).toBe('approved');
    expect(screen.getByText(/已批准/)).toBeInTheDocument();

    rejectArchive = false;
    await userEvent.click(screen.getByRole('button', { name: '归档' }));
    await waitFor(() => expect(current.status).toBe('archived'));
    expect(mockRequest).toHaveBeenCalledWith(
      '/finance/records/finance-1/transitions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ to: 'submitted' }) }),
    );
  });
});
