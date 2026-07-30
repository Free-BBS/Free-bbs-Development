import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ModuleManifest } from '@freebbs-development/contracts';
import type { ApiClient } from '../../core/api/client.js';
import type { PresentationUser } from '../../core/permissions/Can.js';
import { MODULE_MANIFESTS } from '../../app/module-manifests.js';
import { DashboardPage } from './DashboardPage.js';

const policyOnlyUser: PresentationUser = {
  uid: 'policy-admin',
  displayName: '权限管理员',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
  policies: [
    { action: 'finance.record.read', effect: 'allow' },
    { action: 'admin.manage', effect: 'allow' },
  ],
};

function enabledModules(): ModuleManifest[] {
  return MODULE_MANIFESTS.map((module) => ({ ...module, status: 'enabled' }));
}

describe('DashboardPage', () => {
  it('hides governance from a policy-only administrator', async () => {
    const request = vi.fn().mockResolvedValue(enabledModules());

    render(
      <MemoryRouter>
        <DashboardPage client={{ request } as unknown as ApiClient} user={policyOnlyUser} />
      </MemoryRouter>,
    );

    expect(screen.getByText('正在加载模块状态…')).toBeInTheDocument();
    expect(await screen.findAllByTestId('dashboard-module-card')).toHaveLength(7);
    expect(request).toHaveBeenCalledWith('/modules');
    expect(screen.getByRole('link', { name: /经验库/ })).toHaveAttribute('href', '/knowledge');
    expect(screen.getByText('财务治理')).toBeInTheDocument();
    expect(screen.queryByText('权限与模块管理')).not.toBeInTheDocument();
  });

  it('shows governance to a platform super administrator', async () => {
    const request = vi.fn().mockResolvedValue(enabledModules());
    const superAdmin: PresentationUser = {
      ...policyOnlyUser,
      uid: 'super-admin',
      roles: ['platform.super_admin'],
      policies: [],
    };

    render(
      <MemoryRouter>
        <DashboardPage client={{ request } as unknown as ApiClient} user={superAdmin} />
      </MemoryRouter>,
    );

    expect(await screen.findAllByTestId('dashboard-module-card')).toHaveLength(8);
    expect(screen.getByText('权限与模块管理')).toBeInTheDocument();
  });
});
