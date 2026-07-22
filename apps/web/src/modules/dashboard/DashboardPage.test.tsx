import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ModuleManifest } from '@freebbs-development/contracts';
import type { ApiClient } from '../../core/api/client.js';
import { MODULE_MANIFESTS } from '../../app/module-manifests.js';
import { DashboardPage } from './DashboardPage.js';

describe('DashboardPage', () => {
  it('renders all nine module cards with live enabled states', async () => {
    const modules: ModuleManifest[] = MODULE_MANIFESTS.map((module) => ({
      ...module,
      status: module.id === 'sports' ? 'disabled' : 'enabled',
    }));
    const request = vi.fn().mockResolvedValue(modules);

    render(
      <MemoryRouter>
        <DashboardPage client={{ request } as unknown as ApiClient} />
      </MemoryRouter>,
    );

    expect(screen.getByText('正在加载模块状态…')).toBeInTheDocument();
    expect(await screen.findAllByTestId('dashboard-module-card')).toHaveLength(9);
    expect(request).toHaveBeenCalledWith('/modules');
    expect(screen.getByRole('link', { name: /经验库/ })).toHaveAttribute('href', '/knowledge');
    expect(screen.getByText('体育代表队').closest('[aria-disabled="true"]')).not.toBeNull();
    expect(screen.getAllByText('已启用')).toHaveLength(8);
    expect(screen.getByText('已停用')).toBeInTheDocument();
  });
});
