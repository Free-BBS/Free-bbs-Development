import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminPage } from './AdminPage';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('../../core/api/client.js', () => ({
  createApiClient: () => ({ request: mockRequest }),
}));

const modules = [
  {
    id: 'sports',
    name: '体育代表队',
    description: '代表队管理',
    route: '/sports',
    icon: 'sports',
    ownerTeam: '体育团队',
    status: 'enabled',
    requiredPermissions: [],
    order: 7,
  },
];
const roleAssignment = {
  id: 'role-assignment-1',
  subjectUid: 'student-1',
  roleKey: 'department.sports_member',
  expiresAt: null,
  status: 'active',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};
const audit = {
  id: 'audit-1',
  actorUid: 'demo-admin',
  action: 'admin.role_assignment.grant',
  resourceType: 'role_assignment',
  resourceId: 'role-assignment-1',
  details: {},
  status: 'recorded',
  ownerUid: 'demo-admin',
  scope: { type: 'public', id: '*' },
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

function installAdminResponses() {
  mockRequest.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/admin/modules' && init?.method === 'PATCH') return Promise.resolve(modules[0]);
    if (path === '/admin/modules') return Promise.resolve(modules);
    if (path === '/admin/role-assignments' && init?.method === 'POST') {
      return Promise.resolve({ ...roleAssignment, id: 'role-assignment-2' });
    }
    if (
      typeof path === 'string' &&
      path.startsWith('/admin/role-assignments/') &&
      init?.method === 'DELETE'
    ) {
      return Promise.resolve({ deleted: true });
    }
    if (path === '/admin/role-assignments') return Promise.resolve([roleAssignment]);
    if (path === '/admin/tag-assignments') return Promise.resolve([]);
    if (path === '/admin/audit-logs') return Promise.resolve([audit]);
    throw new Error(`Unexpected request ${path}`);
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('grants and revokes a role and refreshes the audit view after each mutation', async () => {
    installAdminResponses();
    render(<AdminPage />);

    expect(await screen.findByText('student-1')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('用户 UID'), 'student-2');
    await userEvent.selectOptions(screen.getByLabelText('角色'), 'department.sports_director');
    await userEvent.click(screen.getByRole('button', { name: '授予角色' }));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        '/admin/role-assignments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            subjectUid: 'student-2',
            roleKey: 'department.sports_director',
            expiresAt: null,
          }),
        }),
      ),
    );
    expect(await screen.findByText('角色已授予')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销 student-1 的角色' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/admin/role-assignments/role-assignment-1', {
        method: 'DELETE',
      }),
    );
    expect(await screen.findByText('角色已撤销')).toBeInTheDocument();
    expect(
      mockRequest.mock.calls.filter(([path]) => path === '/admin/audit-logs').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('toggles a module and shows a clear restricted state', async () => {
    installAdminResponses();
    const { rerender } = render(<AdminPage />);
    const toggle = await screen.findByRole('button', { name: '停用体育代表队' });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        '/admin/modules',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ moduleId: 'sports', enabled: false }),
        }),
      ),
    );
    expect(await screen.findByText('模块已停用')).toBeInTheDocument();

    mockRequest.mockReset();
    mockRequest.mockRejectedValue({ status: 403, message: 'forbidden' });
    rerender(<AdminPage key="restricted" />);
    expect(await screen.findByText('仅平台最高权限可访问')).toBeInTheDocument();
  });
});
