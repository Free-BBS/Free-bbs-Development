import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ModuleManifest } from '@freebbs-development/contracts';
import {
  MODULE_MANIFESTS,
  visibleModuleManifests,
  type ModuleStateOverrides,
} from '../../app/module-manifests.js';
import { createApiClient, type ApiClient } from '../../core/api/client.js';

import type { PresentationUser } from '../../core/permissions/Can.js';
export interface DashboardPageProps {
  client?: Pick<ApiClient, 'request'>;
  user: PresentationUser;
}

type LoadState = 'loading' | 'success' | 'error';

export function DashboardPage({ client, user }: DashboardPageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const [state, setState] = useState<LoadState>('loading');
  const [modules, setModules] = useState<ModuleManifest[]>([]);

  useEffect(() => {
    let active = true;
    setState('loading');
    void api
      .request<ModuleManifest[]>('/modules')
      .then((loaded) => {
        if (!active) return;
        setModules(loaded);
        setState('success');
      })
      .catch(() => {
        if (!active) return;
        setModules([]);
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [api]);

  const cards = useMemo(() => {
    const statusById = new Map(modules.map((module) => [module.id, module.status]));
    const states = Object.fromEntries(
      MODULE_MANIFESTS.map((module) => [module.id, statusById.get(module.id) ?? 'disabled']),
    ) as ModuleStateOverrides;
    return visibleModuleManifests(user, states);
  }, [modules, user]);

  if (state === 'loading') {
    return <p role="status">正在加载模块状态…</p>;
  }

  return (
    <section className="module-page" aria-labelledby="dashboard-heading">
      <header className="page-section-header">
        <div>
          <h2 id="dashboard-heading">发展端工作台</h2>
          <p>从这里进入九个业务模块，并查看当前启用状态。</p>
        </div>
      </header>

      {state === 'error' ? (
        <p role="alert">模块状态暂时无法同步，入口已安全停用，请稍后刷新。</p>
      ) : null}

      <div className="workbench-grid" aria-label="发展端模块">
        {cards.map((module) => {
          const enabled = module.status === 'enabled';
          const content = (
            <>
              <span className="module-icon" aria-hidden="true">
                <img src={module.icon} alt="" />
              </span>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
              <span className="status-badge" data-status={enabled ? 'success' : 'warning'}>
                {enabled ? '已启用' : '已停用'}
              </span>
            </>
          );

          return enabled ? (
            <Link
              className="workbench-card"
              data-testid="dashboard-module-card"
              key={module.id}
              to={module.route}
              aria-label={`${module.name}，已启用`}
            >
              {content}
            </Link>
          ) : (
            <div
              className="workbench-card"
              data-testid="dashboard-module-card"
              key={module.id}
              aria-disabled="true"
              aria-label={`${module.name}，已停用`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
