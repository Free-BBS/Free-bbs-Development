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

describe('FinancePage', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('displays integer-cent amounts and submits an exact cent value before refreshing', async () => {
    const created = {
      ...existingRecord,
      id: 'finance-2',
      title: '迎新活动预算',
      amountCents: 8850,
    };
    mockRequest
      .mockResolvedValueOnce([existingRecord])
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce([existingRecord, created]);

    render(<FinancePage />);

    expect(await screen.findByText('社团年度预算')).toBeInTheDocument();
    expect(screen.getByText('¥123.45')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('记录标题'), '迎新活动预算');
    await userEvent.clear(screen.getByLabelText('金额（元）'));
    await userEvent.type(screen.getByLabelText('金额（元）'), '88.50');
    await userEvent.click(screen.getByRole('button', { name: '提交财务记录' }));

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
          status: 'submitted',
          scope: { type: 'public', id: '*' },
        }),
      }),
    );
    expect(await screen.findByText('财务记录已提交')).toBeInTheDocument();
    expect(screen.getByText('迎新活动预算')).toBeInTheDocument();
  });

  it('distinguishes empty, validation and restricted states', async () => {
    mockRequest.mockResolvedValueOnce([]);
    const { rerender } = render(<FinancePage />);
    expect(await screen.findByText('暂无财务记录')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('记录标题'), '错误金额');
    await userEvent.clear(screen.getByLabelText('金额（元）'));
    await userEvent.type(screen.getByLabelText('金额（元）'), '1.999');
    await userEvent.click(screen.getByRole('button', { name: '提交财务记录' }));
    expect(screen.getByRole('alert')).toHaveTextContent('金额最多保留两位小数');
    expect(mockRequest).toHaveBeenCalledTimes(1);

    mockRequest.mockReset();
    mockRequest.mockRejectedValueOnce({ status: 403, message: 'forbidden' });
    rerender(<FinancePage key="restricted" />);
    expect(await screen.findByText('暂无财务访问权限')).toBeInTheDocument();
  });
});
