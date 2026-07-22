import {
  ROLE_KEYS,
  type ModuleId,
  type ModuleManifest,
  type RoleKey,
} from '@freebbs-development/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { createApiClient } from '../../core/api/client.js';

interface AssignmentBase {
  id: string;
  subjectUid: string;
  expiresAt: string | null;
  status: string;
  scope: { type: string; id: string };
}
interface RoleAssignment extends AssignmentBase {
  roleKey: RoleKey;
}
interface TagAssignment extends AssignmentBase {
  tagKey: string;
}
interface AuditLog {
  id: string;
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}
interface AdminData {
  modules: ModuleManifest[];
  roles: RoleAssignment[];
  tags: TagAssignment[];
  audits: AuditLog[];
}

function statusOf(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : null;
}

export function AdminPage() {
  const client = useMemo(createApiClient, []);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [roleUid, setRoleUid] = useState('');
  const [roleKey, setRoleKey] = useState<RoleKey>(ROLE_KEYS[0]);
  const [tagUid, setTagUid] = useState('');
  const [tagKey, setTagKey] = useState('sports.team_captain');
  const [scopeType, setScopeType] = useState('sports_team');
  const [scopeId, setScopeId] = useState('');

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [modules, roles, tags, audits] = await Promise.all([
        client.request<ModuleManifest[]>('/admin/modules'),
        client.request<RoleAssignment[]>('/admin/role-assignments'),
        client.request<TagAssignment[]>('/admin/tag-assignments'),
        client.request<AuditLog[]>('/admin/audit-logs'),
      ]);
      setData({ modules, roles, tags, audits });
    } catch (caught) {
      setData(null);
      setError(caught);
    }
  }, [client]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setFeedback('');
    setMutationError('');
    try {
      await action();
      await loadAll();
      setFeedback(success);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function grantRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleUid.trim()) {
      setMutationError('请填写用户 UID');
      return;
    }
    void mutate(
      () =>
        client.request('/admin/role-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectUid: roleUid.trim(), roleKey, expiresAt: null }),
        }),
      '角色已授予',
    );
  }

  function grantTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tagUid.trim() || !tagKey.trim()) {
      setMutationError('请填写用户 UID 和 Tag');
      return;
    }
    const scope =
      scopeType.trim() && scopeId.trim()
        ? { type: scopeType.trim(), id: scopeId.trim() }
        : undefined;
    void mutate(
      () =>
        client.request('/admin/tag-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectUid: tagUid.trim(),
            tagKey: tagKey.trim(),
            expiresAt: null,
            ...(scope ? { scope } : {}),
          }),
        }),
      'Tag 已授予',
    );
  }

  if (error !== null && statusOf(error) === 403) {
    return (
      <section className="module-page" aria-labelledby="admin-title">
        <h2 id="admin-title">权限与模块管理</h2>
        <div className="empty-state">
          <h3>仅平台最高权限可访问</h3>
          <p>这里的操作会改变全平台权限和模块状态。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="module-page" aria-labelledby="admin-title">
      <header className="page-heading">
        <div>
          <p className="eyebrow">GOVERNANCE</p>
          <h2 id="admin-title">权限与模块管理</h2>
        </div>
        <p>管理模块开关、角色、作用域 Tag，并核对审计记录。</p>
      </header>
      {data === null && error === null ? <p>正在加载管理数据…</p> : null}
      {error !== null ? <p role="alert">管理数据加载失败，请重试。</p> : null}
      {mutationError ? <p role="alert">{mutationError}</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}

      {data ? (
        <div className="admin-sections">
          <section className="panel" aria-labelledby="modules-title">
            <h3 id="modules-title">模块状态</h3>
            <ul className="record-list">
              {data.modules.map((module) => (
                <li key={module.id} className="record-card">
                  <div>
                    <strong>{module.name}</strong>
                    <p>{module.status === 'enabled' ? '已启用' : '已停用'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () =>
                          client.request('/admin/modules', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              moduleId: module.id as ModuleId,
                              enabled: module.status !== 'enabled',
                            }),
                          }),
                        module.status === 'enabled' ? '模块已停用' : '模块已启用',
                      )
                    }
                  >
                    {module.status === 'enabled' ? `停用${module.name}` : `启用${module.name}`}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="roles-title">
            <h3 id="roles-title">角色分配</h3>
            <form onSubmit={grantRole}>
              <label>
                用户 UID
                <input
                  value={roleUid}
                  onChange={(event) => setRoleUid(event.currentTarget.value)}
                />
              </label>
              <label>
                角色
                <select
                  value={roleKey}
                  onChange={(event) => setRoleKey(event.currentTarget.value as RoleKey)}
                >
                  {ROLE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy}>
                授予角色
              </button>
            </form>
            <ul className="record-list">
              {data.roles.map((assignment) => (
                <li key={assignment.id} className="record-card">
                  <div>
                    <strong>{assignment.subjectUid}</strong>
                    <p>{assignment.roleKey}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`撤销 ${assignment.subjectUid} 的角色`}
                    onClick={() =>
                      void mutate(
                        () =>
                          client.request(`/admin/role-assignments/${assignment.id}`, {
                            method: 'DELETE',
                          }),
                        '角色已撤销',
                      )
                    }
                  >
                    撤销
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="tags-title">
            <h3 id="tags-title">Tag 分配</h3>
            <form onSubmit={grantTag}>
              <label>
                Tag 用户 UID
                <input value={tagUid} onChange={(event) => setTagUid(event.currentTarget.value)} />
              </label>
              <label>
                Tag
                <input value={tagKey} onChange={(event) => setTagKey(event.currentTarget.value)} />
              </label>
              <label>
                作用域类型
                <input
                  value={scopeType}
                  onChange={(event) => setScopeType(event.currentTarget.value)}
                />
              </label>
              <label>
                作用域 ID
                <input
                  value={scopeId}
                  onChange={(event) => setScopeId(event.currentTarget.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                授予 Tag
              </button>
            </form>
            {data.tags.length === 0 ? (
              <p>暂无 Tag 分配</p>
            ) : (
              <ul className="record-list">
                {data.tags.map((assignment) => (
                  <li key={assignment.id} className="record-card">
                    <div>
                      <strong>{assignment.subjectUid}</strong>
                      <p>
                        {assignment.tagKey} · {assignment.scope.type}:{assignment.scope.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`撤销 ${assignment.subjectUid} 的 Tag`}
                      onClick={() =>
                        void mutate(
                          () =>
                            client.request(`/admin/tag-assignments/${assignment.id}`, {
                              method: 'DELETE',
                            }),
                          'Tag 已撤销',
                        )
                      }
                    >
                      撤销
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="audit-title">
            <h3 id="audit-title">审计日志</h3>
            {data.audits.length === 0 ? (
              <p>暂无审计记录</p>
            ) : (
              <ol className="record-list">
                {data.audits.map((entry) => (
                  <li key={entry.id} className="record-card">
                    <div>
                      <strong>{entry.action}</strong>
                      <p>
                        {entry.actorUid} · {entry.resourceType}/{entry.resourceId}
                      </p>
                    </div>
                    <time dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString('zh-CN')}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
