import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { ApiError, createApiClient, type ApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';
import { Can } from '../../core/permissions/Can.js';

type LiaisonVisibility = 'public' | 'organization' | 'restricted';
type LiaisonStatus = 'active' | 'archived';

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

export interface LiaisonPageProps {
  client?: Pick<ApiClient, 'request'>;
  user?: UserContext | null;
}

const visibilityLabels: Record<LiaisonVisibility, string> = {
  public: '公开',
  organization: '组织内',
  restricted: '受限',
};

export function LiaisonPage({ client, user: suppliedUser }: LiaisonPageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const auth = useOptionalAuth();
  const user = suppliedUser === undefined ? (auth?.user ?? null) : suppliedUser;
  const [resources, setResources] = useState<LiaisonResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [restrictedError, setRestrictedError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState('organization');
  const [scopeId, setScopeId] = useState('freebbs');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const loadResources = useCallback(
    async (announceLoading = true) => {
      if (announceLoading) setLoading(true);
      setLoadError(false);
      try {
        setResources(await api.request<LiaisonResource[]>('/liaison/resources'));
      } catch {
        setLoadError(true);
      } finally {
        if (announceLoading) setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  async function queryRestricted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestrictedError(null);
    const cleanType = scopeType.trim();
    const cleanId = scopeId.trim();
    if (!cleanType || !cleanId) {
      setRestrictedError('请填写完整的访问范围');
      return;
    }
    setPending(true);
    try {
      const params = new URLSearchParams({
        visibility: 'restricted',
        scopeType: cleanType,
        scopeId: cleanId,
      });
      setResources(await api.request<LiaisonResource[]>(`/liaison/resources?${params.toString()}`));
    } catch (error) {
      setResources([]);
      setRestrictedError(
        error instanceof ApiError && error.status === 403
          ? '你没有查看该范围受限联络资源的权限'
          : '受限资源查询失败，请稍后重试',
      );
    } finally {
      setPending(false);
    }
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const cleanCategory = category.trim();
    if (!cleanName) {
      setFormError('资源名称不能为空');
      return;
    }
    if (!cleanDescription) {
      setFormError('资源说明不能为空');
      return;
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(cleanCategory)) {
      setFormError('资源分类须使用小写字母、数字、下划线或连字符');
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      await api.request<LiaisonResource>('/liaison/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          description: cleanDescription,
          category: cleanCategory,
          visibility: 'public',
          status: 'active',
          scope: { type: 'public', id: '*' },
        }),
      });
      setName('');
      setDescription('');
      setCategory('');
      setFeedback('联络资源已创建');
      await loadResources(false);
    } catch {
      setFormError('创建失败，请检查权限后重试');
    } finally {
      setPending(false);
    }
  }

  async function archiveResource(resource: LiaisonResource) {
    setFeedback(null);
    setFormError(null);
    setPending(true);
    try {
      await api.request<LiaisonResource>('/liaison/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resource.id, status: 'archived' }),
      });
      setFeedback('联络资源已归档');
      await loadResources(false);
    } catch {
      setFormError('归档失败，请检查权限后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="module-page">
      <section aria-labelledby="liaison-list-heading">
        <header className="page-section-header">
          <div>
            <h2 id="liaison-list-heading">联络资源</h2>
            <p>公开资源可直接查看；组织内和受限资源始终由服务端校验访问范围。</p>
          </div>
        </header>

        <form aria-label="查询受限联络资源" onSubmit={queryRestricted} noValidate>
          <label>
            范围类型
            <input value={scopeType} onChange={(event) => setScopeType(event.target.value)} />
          </label>
          <label>
            范围标识
            <input value={scopeId} onChange={(event) => setScopeId(event.target.value)} />
          </label>
          <button type="submit" disabled={pending}>
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
            {resources.map((resource) => (
              <li key={resource.id} className="record-card">
                <article>
                  <header>
                    <div>
                      <span>{resource.category}</span>
                      <h3>{resource.name}</h3>
                    </div>
                    <span className="status-badge">{visibilityLabels[resource.visibility]}</span>
                  </header>
                  <p>{resource.description}</p>
                  {resource.status === 'active' ? (
                    <Can user={user} permission="liaison.resource.update">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void archiveResource(resource)}
                        aria-label={`归档 ${resource.name}`}
                      >
                        归档
                      </button>
                    </Can>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <Can user={user} permission="liaison.resource.create">
        <section aria-labelledby="liaison-create-heading">
          <h2 id="liaison-create-heading">维护联络资源</h2>
          <form onSubmit={createResource} noValidate>
            <label>
              资源名称
              <input
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              资源说明
              <textarea
                value={description}
                maxLength={20000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label>
              资源分类
              <input
                value={category}
                maxLength={64}
                onChange={(event) => setCategory(event.target.value)}
              />
            </label>
            {formError ? <p role="alert">{formError}</p> : null}
            {feedback ? <p role="status">{feedback}</p> : null}
            <button type="submit" disabled={pending}>
              {pending ? '正在创建…' : '创建资源'}
            </button>
          </form>
        </section>
      </Can>
    </div>
  );
}
