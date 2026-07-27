import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { createApiClient, type ApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';
import { Can } from '../../core/permissions/Can.js';

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

const statusLabels: Record<KnowledgeStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function KnowledgePage({ client, user: suppliedUser }: KnowledgePageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const auth = useOptionalAuth();
  const user = suppliedUser === undefined ? (auth?.user ?? null) : suppliedUser;
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [type, setType] = useState<KnowledgeType>('workflow');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<KnowledgeType>('workflow');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

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
    setOperationError(null);
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
    } catch (error) {
      setFormError(errorMessage(error, '草稿保存失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }

  function beginEdit(entry: KnowledgeEntry) {
    setFeedback(null);
    setOperationError(null);
    setEditingId(entry.id);
    setEditType(entry.type);
    setEditTitle(entry.title);
    setEditBody(entry.body);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, entry: KnowledgeEntry) {
    event.preventDefault();
    const cleanTitle = editTitle.trim();
    const cleanBody = editBody.trim();
    if (!cleanTitle || !cleanBody) {
      setOperationError('标题和正文不能为空');
      return;
    }
    if (!globalThis.confirm(`确认保存“${entry.title}”的修改吗？`)) return;
    setFeedback(null);
    setOperationError(null);
    setPending(true);
    try {
      await api.request<KnowledgeEntry>('/knowledge/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          type: editType,
          title: cleanTitle,
          body: cleanBody,
          scope: entry.scope,
        }),
      });
      setEditingId(null);
      setFeedback('修改已保存');
      await loadEntries(false);
    } catch (error) {
      setOperationError(errorMessage(error, '修改保存失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }

  async function transition(
    entry: KnowledgeEntry,
    to: KnowledgeStatus,
    actionLabel: '发布' | '撤回' | '归档',
  ) {
    if (!globalThis.confirm(`确认${actionLabel}“${entry.title}”吗？`)) return;
    setFeedback(null);
    setOperationError(null);
    setPending(true);
    try {
      await api.request<KnowledgeEntry>(`/knowledge/entries/${entry.id}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      setEditingId(null);
      setFeedback(to === 'published' ? '经验已发布' : to === 'draft' ? '经验已撤回' : '经验已归档');
      await loadEntries(false);
    } catch (error) {
      setOperationError(errorMessage(error, `${actionLabel}失败，请检查权限后重试`));
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
        {operationError ? <p role="alert">{operationError}</p> : null}
        {feedback ? <p role="status">{feedback}</p> : null}
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
                      {statusLabels[entry.status]}
                    </span>
                  </header>

                  {editingId === entry.id ? (
                    <form onSubmit={(event) => void saveEdit(event, entry)} noValidate>
                      <label>
                        编辑类型
                        <select
                          value={editType}
                          onChange={(event) => setEditType(event.target.value as KnowledgeType)}
                        >
                          {Object.entries(typeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        编辑标题
                        <input
                          value={editTitle}
                          maxLength={200}
                          onChange={(event) => setEditTitle(event.target.value)}
                        />
                      </label>
                      <label>
                        编辑正文
                        <textarea
                          value={editBody}
                          maxLength={20000}
                          onChange={(event) => setEditBody(event.target.value)}
                        />
                      </label>
                      <button type="submit" disabled={pending}>
                        保存修改
                      </button>
                      <button type="button" disabled={pending} onClick={() => setEditingId(null)}>
                        取消
                      </button>
                    </form>
                  ) : (
                    <>
                      <p>{entry.body}</p>
                      {entry.status !== 'archived' ? (
                        <Can user={user} permission="knowledge.create">
                          {entry.status === 'published' ? (
                            <Can user={user} permission="knowledge.publish">
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => beginEdit(entry)}
                                aria-label={`编辑 ${entry.title}`}
                              >
                                编辑
                              </button>
                            </Can>
                          ) : (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => beginEdit(entry)}
                              aria-label={`编辑 ${entry.title}`}
                            >
                              编辑
                            </button>
                          )}
                        </Can>
                      ) : null}
                      <Can user={user} permission="knowledge.publish">
                        {entry.status === 'draft' ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void transition(entry, 'published', '发布')}
                            aria-label={`发布 ${entry.title}`}
                          >
                            发布
                          </button>
                        ) : null}
                        {entry.status === 'published' ? (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void transition(entry, 'draft', '撤回')}
                              aria-label={`撤回 ${entry.title}`}
                            >
                              撤回
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void transition(entry, 'archived', '归档')}
                              aria-label={`归档 ${entry.title}`}
                            >
                              归档
                            </button>
                          </>
                        ) : null}
                      </Can>
                    </>
                  )}
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
            <button type="submit" disabled={pending}>
              {pending ? '正在保存…' : '保存草稿'}
            </button>
          </form>
        </section>
      </Can>
    </div>
  );
}
