import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { Can } from '../../core/permissions/Can.js';
import { createApiClient, type ApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

type KnowledgeType = 'workflow' | 'faq' | 'contact' | 'retrospective' | 'notice';
type KnowledgeStatus = 'draft' | 'published' | 'archived';

interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  title: string;
  body: string;
  status: KnowledgeStatus;
  ownerUid: string;
  scope: ScopeRef;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgePageProps {
  client?: Pick<ApiClient, 'request'>;
  user?: UserContext | null;
}

const typeLabels: Record<KnowledgeType, string> = {
  workflow: '工作流程',
  faq: '常见问题',
  contact: '联系人',
  retrospective: '活动复盘',
  notice: '注意事项',
};

export function KnowledgePage({ client, user: suppliedUser }: KnowledgePageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const auth = useOptionalAuth();
  const user = suppliedUser === undefined ? (auth?.user ?? null) : suppliedUser;
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [type, setType] = useState<KnowledgeType>('workflow');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const loadEntries = useCallback(
    async (announceLoading = true) => {
      if (announceLoading) setLoading(true);
      setLoadError(false);
      try {
        const loaded = await api.request<KnowledgeEntry[]>('/knowledge/entries');
        setEntries(loaded);
      } catch {
        setLoadError(true);
      } finally {
        if (announceLoading) setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle) {
      setFormError('标题不能为空');
      return;
    }
    if (!cleanBody) {
      setFormError('正文不能为空');
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      await api.request<KnowledgeEntry>('/knowledge/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: cleanTitle,
          body: cleanBody,
          status: 'draft',
          scope: { type: 'public', id: '*' },
        }),
      });
      setTitle('');
      setBody('');
      setFeedback('草稿已创建');
      await loadEntries(false);
    } catch {
      setFormError('草稿保存失败，请稍后重试');
    } finally {
      setPending(false);
    }
  }

  async function publish(entry: KnowledgeEntry) {
    setFeedback(null);
    setFormError(null);
    setPending(true);
    try {
      await api.request<KnowledgeEntry>('/knowledge/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: 'published' }),
      });
      setFeedback('经验已发布');
      await loadEntries(false);
    } catch {
      setFormError('发布失败，请检查权限后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="module-page">
      <section aria-labelledby="knowledge-list-heading">
        <header className="page-section-header">
          <div>
            <h2 id="knowledge-list-heading">经验条目</h2>
            <p>把基础流程、常见问题和活动复盘沉淀为可持续维护的组织经验。</p>
          </div>
        </header>

        {loading ? <p role="status">正在加载经验条目…</p> : null}
        {!loading && loadError ? (
          <section role="alert">
            <h3>暂时无法加载经验库</h3>
            <button type="button" onClick={() => void loadEntries()}>
              重试
            </button>
          </section>
        ) : null}
        {!loading && !loadError && entries.length === 0 ? (
          <section>
            <h3>经验库中还没有内容</h3>
            <p>有维护权限的同学可以先创建一份草稿。</p>
          </section>
        ) : null}
        {!loading && !loadError && entries.length > 0 ? (
          <ul className="record-list" aria-label="经验条目列表">
            {entries.map((entry) => (
              <li key={entry.id} className="record-card">
                <article>
                  <header>
                    <div>
                      <span>{typeLabels[entry.type]}</span>
                      <h3>{entry.title}</h3>
                    </div>
                    <span
                      className="status-badge"
                      data-status={entry.status === 'published' ? 'success' : 'warning'}
                    >
                      {entry.status === 'published'
                        ? '已发布'
                        : entry.status === 'draft'
                          ? '草稿'
                          : '已归档'}
                    </span>
                  </header>
                  <p>{entry.body}</p>
                  {entry.status === 'draft' ? (
                    <Can user={user} permission="knowledge.publish">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void publish(entry)}
                        aria-label={`发布 ${entry.title}`}
                      >
                        发布
                      </button>
                    </Can>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <Can user={user} permission="knowledge.create">
        <section aria-labelledby="knowledge-create-heading">
          <h2 id="knowledge-create-heading">创建经验草稿</h2>
          <form onSubmit={createDraft} noValidate>
            <label>
              经验类型
              <select
                value={type}
                onChange={(event) => setType(event.target.value as KnowledgeType)}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              经验标题
              <input
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              经验正文
              <textarea
                value={body}
                maxLength={20000}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            {formError ? <p role="alert">{formError}</p> : null}
            {feedback ? <p role="status">{feedback}</p> : null}
            <button type="submit" disabled={pending}>
              {pending ? '正在保存…' : '保存草稿'}
            </button>
          </form>
        </section>
      </Can>
    </div>
  );
}
