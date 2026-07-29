import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import type { ModuleManifest } from '@freebbs-development/contracts';

import freeBbsEmblem from '../assets/freebbs-emblem-v2.png';
import { DemoUserSwitcher } from '../core/auth/DemoUserSwitcher.js';
import { useAuth } from '../core/auth/AuthProvider.js';
import type { PresentationUser } from '../core/permissions/Can.js';
import { useMainSiteTheme } from '../core/theme/useMainSiteTheme.js';
import {
  MODULE_MANIFESTS,
  visibleModuleManifests,
  type ModuleStateOverrides,
} from './module-manifests.js';

export interface AppShellProps {
  children?: ReactNode;
  moduleStates?: ModuleStateOverrides;
}

interface ModuleNavigationProps {
  activePath?: string;
  className: string;
  ensureCurrentVisible?: boolean;
  label: string;
  moduleStates?: ModuleStateOverrides;
  user: PresentationUser;
}

function ModuleNavigation({
  activePath,
  className,
  ensureCurrentVisible = false,
  label,
  moduleStates,
  user,
}: ModuleNavigationProps) {
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ensureCurrentVisible) {
      return;
    }

    navigationRef.current
      ?.querySelector<HTMLElement>('a[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activePath, ensureCurrentVisible]);

  return (
    <nav ref={navigationRef} className={className} aria-label={label}>
      {visibleModuleManifests(user, moduleStates).map((module) => {
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
            <NavLink
              className={({ isActive }) => `module-link${isActive ? ' active' : ''}`}
              end
              to={module.route}
            >
              {content}
            </NavLink>
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

  const theme = useMainSiteTheme();
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
          <NavLink className="brand" to="/dashboard" aria-label="FREE BBS">
            <img className="brand-mark" src={freeBbsEmblem} alt="FREE BBS" />
            <span className="brand-copy">
              <span className="brand-name">FREE</span>
              <span className="brand-subtitle">BBS</span>
            </span>
          </NavLink>

          <ModuleNavigation
            className="module-nav"
            label="主要导航"
            moduleStates={moduleStates}
            user={auth.user as PresentationUser}
          />

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
            <div className="titlebar-actions">
              <button
                aria-label={theme.mode === 'light' ? '切换到暗色模式' : '切换到明亮模式'}
                aria-pressed={theme.mode === 'light'}
                className="theme-toggle"
                onClick={theme.toggle}
                type="button"
              >
                <span aria-hidden="true">{theme.mode === 'light' ? '◐' : '◑'}</span>
              </button>
              {auth.authMode === 'demo' ? <DemoUserSwitcher /> : null}
            </div>
          </header>

          <main className="page-content" id="main-content">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>

      <ModuleNavigation
        activePath={location.pathname}
        className="mobile-nav"
        ensureCurrentVisible
        label="移动导航"
        moduleStates={moduleStates}
        user={auth.user as PresentationUser}
      />
    </>
  );
}
