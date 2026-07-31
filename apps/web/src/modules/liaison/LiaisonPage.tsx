import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { ApiError, createApiClient, type ApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

type LiaisonVisibility = 'public' | 'organization' | 'restricted';
type LiaisonStatus = 'active' | 'archived';
type LiaisonUser = UserContext & {
  policies?: readonly {
    action: string;
    effect?: 'allow' | 'deny';
    resource?: string;
    scope?: ScopeRef;
    expiresAt?: string | null;
  }[];
};

interface LiaisonResource {
  id: string;
  name: string;
  description: string;
  category: string;
  visibility: LiaisonVisibility;
  status: LiaisonStatus;
  ownerUid: string;
  scope: ScopeRef;
  createdAt: string;
  updatedAt: string;
}

interface ResourceDraft {
  name: string;
  description: string;
  category: string;
  visibility: LiaisonVisibility;
  scopeType: string;
  scopeId: string;
}

export interface LiaisonPageProps {
  client?: Pick<ApiClient, 'request'>;
  user?: LiaisonUser | null;
}

const visibilityLabels: Record<LiaisonVisibility, string> = {
  public: '公开',
  organization: '组织内',
  restricted: '受限',
};
const statusLabels: Record<LiaisonStatus, string> = {
  active: '使用中',
  archived: '已归档',
};
const emptyDraft: ResourceDraft = {
  name: '',
  description: '',
  category: '',
  visibility: 'public',
  scopeType: 'public',
  scopeId: '*',
};

function matches(pattern: string, action: string): boolean {
  return (
    pattern === '*' ||
    pattern === action ||
    (pattern.endsWith('.*') && action.startsWith(pattern.slice(0, -1)))
  );
}

function hasPermission(
  user: LiaisonUser | null | undefined,
  action: string,
  scope: ScopeRef,
): boolean {
  if (!user) return false;
  const now = Date.now();
  const policies = (user.policies ?? []).filter(
    (policy) =>
      matches(policy.action, action) &&
      policy.resource === 'liaison_resource' &&
      (policy.scope === undefined ||
        (policy.scope.type === scope.type && policy.scope.id === scope.id)) &&
      (policy.expiresAt == null || Date.parse(policy.expiresAt) > now),
  );
  return (
    !policies.some((policy) => policy.effect === 'deny') &&
    policies.some((policy) => policy.effect !== 'deny')
  );
}

function hasAnyPermission(user: LiaisonUser | null | undefined, action: string): boolean {
  return Boolean(
    user?.policies?.some(
      (policy) =>
        matches(policy.action, action) &&
        policy.resource === 'liaison_resource' &&
        policy.effect !== 'deny',
    ),
  );
}

function scopeFor(draft: ResourceDraft): ScopeRef {
  if (draft.visibility === 'public') return { type: 'public', id: '*' };
  if (draft.visibility === 'organization') {
    return { type: 'organization', id: draft.scopeId.trim() };
  }
  return { type: draft.scopeType.trim(), id: draft.scopeId.trim() };
}

function validateDraft(draft: ResourceDraft): string | null {
  if (!draft.name.trim()) return '资源名称不能为空';
  if (!draft.description.trim()) return '资源说明不能为空';
  if (!/^[a-z][a-z0-9_-]*$/.test(draft.category.trim())) {
    return '资源分类须使用小写字母、数字、下划线或连字符';
  }
  const scope = scopeFor(draft);
  if (!scope.type || !scope.id || (draft.visibility !== 'public' && scope.id === '*')) {
    return '请填写有效且精确的访问范围';
  }
  if (!/^[a-z][a-z0-9_]*$/.test(scope.type)) return '范围类型格式不正确';
  return null;
}

function draftFrom(resource: LiaisonResource): ResourceDraft {
  return {
    name: resource.name,
    description: resource.description,
    category: resource.category,
    visibility: resource.visibility,
    scopeType: resource.scope.type,
    scopeId: resource.scope.id,
  };
}

export function LiaisonPage({ client, user: suppliedUser }: LiaisonPageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const auth = useOptionalAuth();
  const user = suppliedUser === undefined ? (auth?.user ?? null) : suppliedUser;
  const [resources, setResources] = useState<LiaisonResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [restrictedError, setRestrictedError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [queryScopeType, setQueryScopeType] = useState('organization');
  const [queryScopeId, setQueryScopeId] = useState('freebbs');
  const [createDraft, setCreateDraft] = useState<ResourceDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ResourceDraft | null>(null);

  const loadResources = useCallback(
    async (announceLoading = true) => {
      if (announceLoading) {
        setLoading(true);
        setLoadError(false);
      }
      try {
        setResources(await api.request<LiaisonResource[]>('/liaison/resources'));
      } catch {
        if (announceLoading) setLoadError(true);
      } finally {
        if (announceLoading) setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  function replaceConfirmed(resource: LiaisonResource) {
    setResources((current) =>
      current.some((item) => item.id === resource.id)
        ? current.map((item) => (item.id === resource.id ? resource : item))
        : [...current, resource],
    );
  }

  async function queryRestricted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestrictedError(null);
    const cleanType = queryScopeType.trim();
    const cleanId = queryScopeId.trim();
    if (!cleanType || !cleanId) {
      setRestrictedError('请填写完整的访问范围');
      return;
    }
    setPendingId('query');
    try {
      const params = new URLSearchParams({
        visibility: 'restricted',
        scopeType: cleanType,
        scopeId: cleanId,
      });
      setResources(await api.request<LiaisonResource[]>(`/liaison/resources?${params.toString()}`));
    } catch (error) {
      setRestrictedError(
        error instanceof ApiError && error.status === 403
          ? '你没有查看该范围受限联络资源的权限'
          : '受限资源查询失败，请稍后重试',
      );
    } finally {
      setPendingId(null);
    }
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const error = validateDraft(createDraft);
    if (error) {
      setFormError(error);
      return;
    }
    const scope = scopeFor(createDraft);
    if (!hasPermission(user, 'liaison.resource.create', scope)) {
      setFormError('你没有在该范围创建联络资源的权限');
      return;
    }
    setFormError(null);
    setPendingId('create');
    try {
      const created = await api.request<LiaisonResource>('/liaison/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          description: createDraft.description.trim(),
          category: createDraft.category.trim(),
          visibility: createDraft.visibility,
          status: 'active',
          scope,
        }),
      });
      replaceConfirmed(created);
      setCreateDraft(emptyDraft);
      setFeedback('联络资源已创建');
      await loadResources(false);
    } catch {
      setFormError('创建失败，请检查权限和范围后重试');
    } finally {
      setPendingId(null);
    }
  }

  function beginEdit(resource: LiaisonResource) {
    setEditingId(resource.id);
    setEditDraft(draftFrom(resource));
    setFormError(null);
    setFeedback(null);
  }

  async function saveResource(event: FormEvent<HTMLFormElement>, resource: LiaisonResource) {
    event.preventDefault();
    if (!editDraft) return;
    const error = validateDraft(editDraft);
    if (error) {
      setFormError(error);
      return;
    }
    const targetScope = scopeFor(editDraft);
    if (
      !hasPermission(user, 'liaison.resource.update', resource.scope) ||
      !hasPermission(user, 'liaison.resource.update', targetScope)
    ) {
      setFormError('你没有修改当前范围或目标范围的权限');
      return;
    }
    setPendingId(resource.id);
    setFormError(null);
    try {
      const updated = await api.request<LiaisonResource>('/liaison/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: resource.id,
          name: editDraft.name.trim(),
          description: editDraft.description.trim(),
          category: editDraft.category.trim(),
          visibility: editDraft.visibility,
          scope: targetScope,
        }),
      });
      replaceConfirmed(updated);
      setEditingId(null);
      setEditDraft(null);
      setFeedback('联络资源已更新');
      await loadResources(false);
    } catch {
      setFormError('保存失败，已保留服务器确认的原状态');
    } finally {
      setPendingId(null);
    }
  }

  async function transitionResource(resource: LiaisonResource) {
    const to: LiaisonStatus = resource.status === 'active' ? 'archived' : 'active';
    setFeedback(null);
    setFormError(null);
    setPendingId(resource.id);
    try {
      const updated = await api.request<LiaisonResource>(
        `/liaison/resources/${resource.id}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to }),
        },
      );
      replaceConfirmed(updated);
      setFeedback(to === 'archived' ? '联络资源已归档' : '联络资源已恢复');
      await loadResources(false);
    } catch {
      setFormError(`${to === 'archived' ? '归档' : '恢复'}失败，已保留服务器确认的原状态`);
    } finally {
      setPendingId(null);
    }
  }

  function updateDraft(
    current: ResourceDraft,
    setDraft: (draft: ResourceDraft) => void,
    patch: Partial<ResourceDraft>,
  ) {
    const next = { ...current, ...patch };
    if (patch.visibility === 'public') {
      next.scopeType = 'public';
      next.scopeId = '*';
    } else if (patch.visibility === 'organization') {
      next.scopeType = 'organization';
      if (next.scopeId === '*') next.scopeId = 'freebbs';
    } else if (patch.visibility === 'restricted' && next.scopeId === '*') {
      next.scopeType = 'organization';
      next.scopeId = 'freebbs';
    }
    setDraft(next);
  }

  function resourceFields(
    draft: ResourceDraft,
    setDraft: (draft: ResourceDraft) => void,
    prefix: string,
  ) {
    return (
      <>
        <label>
          资源名称
          <input
            aria-label={prefix ? `${prefix}资源名称` : '资源名称'}
            value={draft.name}
            maxLength={200}
            onChange={(event) => updateDraft(draft, setDraft, { name: event.target.value })}
          />
        </label>
        <label>
          资源说明
          <textarea
            aria-label={prefix ? `${prefix}资源说明` : '资源说明'}
            value={draft.description}
            maxLength={20000}
            onChange={(event) => updateDraft(draft, setDraft, { description: event.target.value })}
          />
        </label>
        <label>
          资源分类
          <input
            aria-label={prefix ? `${prefix}资源分类` : '资源分类'}
            value={draft.category}
            maxLength={64}
            onChange={(event) => updateDraft(draft, setDraft, { category: event.target.value })}
          />
        </label>
        <label>
          可见范围
          <select
            aria-label={prefix ? `${prefix}可见范围` : '可见范围'}
            value={draft.visibility}
            onChange={(event) =>
              updateDraft(draft, setDraft, {
                visibility: event.target.value as LiaisonVisibility,
              })
            }
          >
            <option value="public">公开</option>
            <option value="organization">组织内</option>
            <option value="restricted">受限</option>
          </select>
        </label>
        {draft.visibility !== 'public' ? (
          <>
            <label>
              范围类型
              <input
                aria-label={prefix ? `${prefix}范围类型` : '范围类型'}
                value={draft.scopeType}
                readOnly={draft.visibility === 'organization'}
                onChange={(event) =>
                  updateDraft(draft, setDraft, { scopeType: event.target.value })
                }
              />
            </label>
            <label>
              范围标识
              <input
                aria-label={prefix ? `${prefix}范围标识` : '范围标识'}
                value={draft.scopeId}
                onChange={(event) => updateDraft(draft, setDraft, { scopeId: event.target.value })}
              />
            </label>
          </>
        ) : null}
      </>
    );
  }

  return (
    <div className="module-page">
      <section aria-labelledby="liaison-list-heading">
        <header className="page-section-header">
          <div>
            <h2 id="liaison-list-heading">联络资源</h2>
            <p>公开资源可直接查看；组织内和受限资源始终由服务端按资源范围校验。</p>
          </div>
        </header>

        <form aria-label="查询受限联络资源" onSubmit={queryRestricted} noValidate>
          <label>
            范围类型
            <input
              value={queryScopeType}
              onChange={(event) => setQueryScopeType(event.target.value)}
            />
          </label>
          <label>
            范围标识
            <input value={queryScopeId} onChange={(event) => setQueryScopeId(event.target.value)} />
          </label>
          <button type="submit" disabled={pendingId !== null}>
            查询受限资源
          </button>
        </form>
        {restrictedError ? <p role="alert">{restrictedError}</p> : null}

        {loading ? <p role="status">正在加载联络资源…</p> : null}
        {!loading && loadError ? (
          <section role="alert">
            <h3>暂时无法加载联络资源</h3>
            <button type="button" onClick={() => void loadResources()}>
              重试
            </button>
          </section>
        ) : null}
        {!loading && !loadError && resources.length === 0 && !restrictedError ? (
          <section>
            <h3>当前范围内没有联络资源</h3>
          </section>
        ) : null}
        {!loading && !loadError && resources.length > 0 ? (
          <ul className="record-list" aria-label="联络资源列表">
            {resources.map((resource) => {
              const mayUpdate = hasPermission(user, 'liaison.resource.update', resource.scope);
              const isEditing = editingId === resource.id && editDraft !== null;
              return (
                <li key={resource.id} className="record-card">
                  <article>
                    <header>
                      <div>
                        <span>{resource.category}</span>
                        <h3>{resource.name}</h3>
                      </div>
                      <span className="status-badge">
                        {visibilityLabels[resource.visibility]} · {statusLabels[resource.status]}
                      </span>
                    </header>
                    <p>{resource.description}</p>
                    <p>
                      范围键：<code>{`${resource.scope.type}/${resource.scope.id}`}</code>
                    </p>
                    {isEditing ? (
                      <form onSubmit={(event) => void saveResource(event, resource)} noValidate>
                        {resourceFields(editDraft, setEditDraft, '编辑')}
                        <button type="submit" disabled={pendingId !== null}>
                          保存修改
                        </button>
                        <button
                          type="button"
                          disabled={pendingId !== null}
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                            setFormError(null);
                          }}
                        >
                          取消
                        </button>
                      </form>
                    ) : mayUpdate ? (
                      <div>
                        <button type="button" onClick={() => beginEdit(resource)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={pendingId !== null}
                          onClick={() => void transitionResource(resource)}
                          aria-label={`${resource.status === 'active' ? '归档' : '恢复'} ${resource.name}`}
                        >
                          {resource.status === 'active' ? '归档' : '恢复'}
                        </button>
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}
        {formError ? <p role="alert">{formError}</p> : null}
        {feedback ? <p role="status">{feedback}</p> : null}
      </section>

      {hasAnyPermission(user, 'liaison.resource.create') ? (
        <section aria-labelledby="liaison-create-heading">
          <h2 id="liaison-create-heading">维护联络资源</h2>
          <form onSubmit={createResource} noValidate>
            {resourceFields(createDraft, setCreateDraft, '')}
            <button type="submit" disabled={pendingId !== null}>
              {pendingId === 'create' ? '正在创建…' : '创建资源'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
