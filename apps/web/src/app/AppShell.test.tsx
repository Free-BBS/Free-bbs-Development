import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';

import { AppShell } from './AppShell.js';
import { loadModuleStates } from './router.js';

const { mockRequest, mockUseAuth } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../core/auth/AuthProvider.js', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../core/api/client.js', () => ({
  createApiClient: () => ({ request: mockRequest }),
}));

vi.mock('../core/auth/DemoUserSwitcher.js', () => ({
  DemoUserSwitcher: () => <div data-testid="demo-user-switcher">演示身份切换</div>,
}));

const user: UserContext = {
  uid: 'student-1',
  displayName: '林同学',
  avatarUrl: '/avatars/student-1.png',
  baseRole: 'student',
  roles: [],
  tags: [],
};

function authenticatedAuth(overrides: Record<string, unknown> = {}) {
  return {
    status: 'authenticated',
    user,
    error: null,
    reload: vi.fn(),
    authMode: 'main',
    demoUser: 'demo-student',
    setDemoUser: vi.fn(),
    loginUrl: '/login?returnTo=%2Fdevelopment%2Fdashboard',
    ...overrides,
  };
}

function renderShell(route = '/knowledge', props: React.ComponentProps<typeof AppShell> = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell {...props} />
    </MemoryRouter>,
  );
}

describe('module state loader', () => {
  it('fails closed when the module registry cannot be loaded', async () => {
    mockRequest.mockRejectedValueOnce(new Error('registry unavailable'));
    const states = await loadModuleStates();
    expect(Object.keys(states)).toHaveLength(9);
    expect(Object.values(states)).toEqual(Array(9).fill('disabled'));
  });
});

describe('AppShell', () => {
  it('hides the dashboard and protected modules while keeping the dashboard brand target', () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());

    renderShell('/knowledge');

    const navigation = screen.getByRole('navigation', { name: '主要导航' });
    const items = within(navigation).getAllByTestId('module-navigation-item');

    expect(items.map((item) => item.querySelector('.module-name')?.textContent)).toEqual([
      '经验库',
      '信息与咨询',
      '趣缘群体',
      '活动',
      '联络资源',
      '体育代表队',
    ]);
    expect(within(navigation).queryByRole('link', { name: '工作台' })).not.toBeInTheDocument();
    expect(within(navigation).queryByText('财务治理')).not.toBeInTheDocument();
    expect(within(navigation).queryByText('权限与模块管理')).not.toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: '经验库' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'FREE BBS' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('img', { name: 'FREE BBS' })).toHaveAttribute(
      'src',
      expect.stringContaining('freebbs-emblem-v2.png'),
    );
  });

  it('keeps the current mobile navigation item horizontally reachable', () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      renderShell('/sports');

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    } finally {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('omits a disabled module from navigation', () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());

    renderShell('/dashboard', { moduleStates: { events: 'disabled' } });

    const navigation = screen.getByRole('navigation', { name: '主要导航' });
    expect(within(navigation).queryByRole('link', { name: '活动' })).not.toBeInTheDocument();
    expect(within(navigation).queryByText('活动')).not.toBeInTheDocument();
  });

  it('renders the authenticated user name and avatar', () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());

    renderShell();

    expect(screen.getByText('林同学')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '林同学头像' })).toHaveAttribute(
      'src',
      '/avatars/student-1.png',
    );
  });

  it('renders a text avatar fallback and the demo identity switcher', () => {
    mockUseAuth.mockReturnValue(
      authenticatedAuth({
        authMode: 'demo',
        user: { ...user, displayName: '周同学', avatarUrl: null },
      }),
    );

    renderShell();

    expect(screen.getByLabelText('周同学头像')).toHaveTextContent('周');
    expect(screen.getByTestId('demo-user-switcher')).toBeInTheDocument();
  });

  it('shows a safe main-site login action for an unauthenticated user', () => {
    mockUseAuth.mockReturnValue({
      ...authenticatedAuth(),
      status: 'unauthenticated',
      user: null,
      loginUrl: '/login?returnTo=%2Fdevelopment%2Fknowledge',
    });

    renderShell('/knowledge');

    expect(screen.getByRole('link', { name: '登录主站' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fdevelopment%2Fknowledge',
    );
  });

  it('renders recoverable loading and error states', () => {
    mockUseAuth.mockReturnValue({
      ...authenticatedAuth(),
      status: 'loading',
      user: null,
    });
    const { rerender } = renderShell();
    expect(screen.getByText('正在加载身份信息…')).toBeInTheDocument();

    const reload = vi.fn();
    mockUseAuth.mockReturnValue({
      ...authenticatedAuth(),
      status: 'error',
      user: null,
      error: new Error('network unavailable'),
      reload,
    });
    rerender(
      <MemoryRouter initialEntries={['/knowledge']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('身份信息加载失败');
    screen.getByRole('button', { name: '重试' }).click();
    expect(reload).toHaveBeenCalledOnce();
  });
});

it('does not expose governance to a policy-only administrator', () => {
  mockUseAuth.mockReturnValue(
    authenticatedAuth({
      user: {
        ...user,
        policies: [
          { action: 'finance.*', effect: 'allow' },
          { action: 'admin.manage', effect: 'allow' },
        ],
      },
    }),
  );

  renderShell('/finance');

  const navigation = screen.getByRole('navigation', { name: '主要导航' });
  expect(navigation).toHaveTextContent('财务治理');
  expect(within(navigation).queryByText('权限与模块管理')).not.toBeInTheDocument();
});

it('exposes governance to a platform super administrator', () => {
  mockUseAuth.mockReturnValue(
    authenticatedAuth({ user: { ...user, roles: ['platform.super_admin'] } }),
  );

  renderShell('/admin');

  expect(
    within(screen.getByRole('navigation', { name: '主要导航' })).getByRole('link', {
      name: '权限与模块管理',
    }),
  ).toBeInTheDocument();
});
