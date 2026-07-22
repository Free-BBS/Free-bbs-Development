import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../core/api/client.js';
import { InformationPage } from './InformationPage.js';

const announcement = {
  id: 'announcement-1',
  title: '发展平台开放测试',
  body: '欢迎提交建议和问题。',
  status: 'published',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

describe('InformationPage', () => {
  it('renders announcements and distinguishes empty and error states', async () => {
    const successClient = {
      request: vi.fn(async (path: string) =>
        path.endsWith('/announcements') ? [announcement] : [],
      ),
    } as unknown as ApiClient;
    const successView = render(<InformationPage client={successClient} />);
    expect(screen.getByText('正在加载信息与咨询…')).toBeInTheDocument();
    expect(await screen.findByText('发展平台开放测试')).toBeInTheDocument();
    successView.unmount();

    const emptyClient = { request: vi.fn().mockResolvedValue([]) } as unknown as ApiClient;
    const emptyView = render(<InformationPage client={emptyClient} />);
    expect(await screen.findByText('目前没有公开信息')).toBeInTheDocument();
    emptyView.unmount();

    const errorClient = {
      request: vi.fn().mockRejectedValue(new Error('network down')),
    } as unknown as ApiClient;
    render(<InformationPage client={errorClient} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法加载信息与咨询');
  });

  it('validates and submits a consultation, shows feedback and refreshes data', async () => {
    const consultations: Array<Record<string, unknown>> = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (path === '/information/announcements' && method === 'GET') return [announcement];
      if (path === '/information/consultations' && method === 'GET') return [...consultations];
      if (path === '/information/consultations' && method === 'POST') {
        const input = JSON.parse(String(init?.body)) as { title: string; body: string };
        const created = { id: 'consultation-1', ...input, status: 'submitted' };
        consultations.push(created);
        return created;
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    const user = userEvent.setup();
    render(<InformationPage client={{ request } as unknown as ApiClient} />);

    await screen.findByText('发展平台开放测试');
    await user.click(screen.getByRole('button', { name: '提交咨询' }));
    expect(screen.getByText('咨询标题不能为空')).toBeInTheDocument();

    await user.type(screen.getByLabelText('咨询标题'), '如何申请活动场地');
    await user.type(screen.getByLabelText('咨询内容'), '希望了解申请入口和审批周期。');
    await user.click(screen.getByRole('button', { name: '提交咨询' }));

    expect(await screen.findByRole('status')).toHaveTextContent('咨询已提交');
    expect(request).toHaveBeenCalledWith(
      '/information/consultations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: '如何申请活动场地',
          body: '希望了解申请入口和审批周期。',
        }),
      }),
    );
    expect(await screen.findByText('如何申请活动场地')).toBeInTheDocument();
    expect(
      request.mock.calls.filter(([path, init]) => path === '/information/announcements' && !init),
    ).toHaveLength(2);
    expect(
      request.mock.calls.filter(([path, init]) => path === '/information/consultations' && !init),
    ).toHaveLength(2);
  });
});
