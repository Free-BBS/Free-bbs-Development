import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import type { ModuleManifest } from '@freebbs-development/contracts';

import { DemoUserSwitcher } from '../core/auth/DemoUserSwitcher.js';
import { useAuth } from '../core/auth/AuthProvider.js';
import {
  MODULE_MANIFESTS,
  resolveModuleStatus,
  type ModuleStateOverrides,
} from './module-manifests.js';

export interface AppShellProps {
  children?: ReactNode;
  moduleStates?: ModuleStateOverrides;
}

interface ModuleNavigationProps {
  className: string;
  label: string;
  moduleStates?: ModuleStateOverrides;
}

function ModuleNavigation({ className, label, moduleStates }: ModuleNavigationProps) {
  return (
    <nav className={className} aria-label={label}>
      {MODULE_MANIFESTS.map((module) => {
        const content = (
          <>
            <span className="module-icon" aria-hidden="true">
              <img src={module.icon} alt="" />
            </span>
            <span className="module-copy">
              <span className="module-name">{module.name}</span>
              <span className="module-owner" aria-hidden="true">
                {module.ownerTeam}
              </span>
            </span>
          </>
        );

        return (
          <div data-testid="module-navigation-item" key={module.id}>
            {resolveModuleStatus(module, moduleStates) === 'enabled' ? (
              <NavLink
                className={({ isActive }) => `module-link${isActive ? ' active' : ''}`}
                end
                to={module.route}
              >
                {content}
              </NavLink>
            ) : (
              <span className="module-link" aria-disabled="true">
                {content}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AuthState({ children }: { children: ReactNode }) {
  return (
    <main className="auth-state">
      <div>{children}</div>
    </main>
  );
}

function currentModule(pathname: string): ModuleManifest {
  return (
    MODULE_MANIFESTS.find(
      (module) => pathname === module.route || pathname.startsWith(`${module.route}/`),
    ) ?? MODULE_MANIFESTS[0]
  );
}

export function AppShell({ children, moduleStates }: AppShellProps) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <AuthState>
        <h1>FREE / BBS</h1>
        <p>正在加载身份信息…</p>
      </AuthState>
    );
  }

  if (auth.status === 'unauthenticated') {
    return (
      <AuthState>
        <h1>需要登录</h1>
        <p>请使用主站账号登录后继续访问发展平台。</p>
        <a href={auth.loginUrl}>登录主站</a>
      </AuthState>
    );
  }

  if (auth.status === 'error') {
    return (
      <AuthState>
        <div role="alert">
          <h1>身份信息加载失败</h1>
          <p>{auth.error?.message ?? '暂时无法连接身份服务，请稍后重试。'}</p>
          <button type="button" onClick={auth.reload}>
            重试
          </button>
        </div>
      </AuthState>
    );
  }

  if (!auth.user) {
    return (
      <AuthState>
        <div role="alert">
          <h1>身份信息不可用</h1>
          <button type="button" onClick={auth.reload}>
            重试
          </button>
        </div>
      </AuthState>
    );
  }

  const module = currentModule(location.pathname);
  const avatarLabel = `${auth.user.displayName}头像`;
  const avatarFallback = Array.from(auth.user.displayName.trim())[0] ?? '用';

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className="app-shell">
        <aside className="sidebar" aria-label="发展平台侧栏">
          <NavLink className="brand" to="/dashboard" aria-label="FREE BBS 工作台">
            <span className="brand-mark" aria-hidden="true">
              F
            </span>
            <span className="brand-copy">
              <span className="brand-name">FREE</span>
              <span className="brand-subtitle">BBS</span>
            </span>
          </NavLink>

          <ModuleNavigation className="module-nav" label="主要导航" moduleStates={moduleStates} />

          <div className="sidebar-footer">
            <div className="user-card">
              {auth.user.avatarUrl ? (
                <span className="user-avatar">
                  <img src={auth.user.avatarUrl} alt={avatarLabel} />
                </span>
              ) : (
                <span className="user-avatar" role="img" aria-label={avatarLabel}>
                  {avatarFallback}
                </span>
              )}
              <span className="user-copy">
                <strong>{auth.user.displayName}</strong>
                <small>{auth.user.uid}</small>
              </span>
            </div>
          </div>
        </aside>

        <div>
          <header className="titlebar">
            <div>
              <h1>{module.name}</h1>
              <p>{module.description}</p>
            </div>
            {auth.authMode === 'demo' ? <DemoUserSwitcher /> : null}
          </header>

          <main className="page-content" id="main-content">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>

      <ModuleNavigation className="mobile-nav" label="移动导航" moduleStates={moduleStates} />
    </>
  );
}
