import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { ScopeRef } from '@freebbs-development/contracts';
import { createApiClient, type ApiClient } from '../../core/api/client.js';

interface Announcement {
  id: string;
  title: string;
  body: string;
  status: 'draft' | 'published' | 'archived';
  ownerUid: string;
  scope: ScopeRef;
  createdAt: string;
  updatedAt: string;
}

interface Consultation {
  id: string;
  title: string;
  body: string;
  status: 'submitted' | 'triaged' | 'processing' | 'resolved' | 'closed';
}

export interface InformationPageProps {
  client?: Pick<ApiClient, 'request'>;
}

const consultationStatus: Record<Consultation['status'], string> = {
  submitted: '已提交',
  triaged: '已分流',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

export function InformationPage({ client }: InformationPageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const loadInformation = useCallback(
    async (announceLoading = true) => {
      if (announceLoading) setLoading(true);
      setLoadError(false);
      try {
        const [loadedAnnouncements, loadedConsultations] = await Promise.all([
          api.request<Announcement[]>('/information/announcements'),
          api.request<Consultation[]>('/information/consultations'),
        ]);
        setAnnouncements(loadedAnnouncements);
        setConsultations(loadedConsultations);
      } catch {
        setLoadError(true);
      } finally {
        if (announceLoading) setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadInformation();
  }, [loadInformation]);

  async function submitConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle) {
      setFormError('咨询标题不能为空');
      return;
    }
    if (!cleanBody) {
      setFormError('咨询内容不能为空');
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      await api.request<Consultation>('/information/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle, body: cleanBody }),
      });
      setTitle('');
      setBody('');
      setFeedback('咨询已提交');
      await loadInformation(false);
    } catch {
      setFormError('咨询提交失败，请稍后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="module-page">
      {loading ? <p role="status">正在加载信息与咨询…</p> : null}
      {!loading && loadError ? (
        <section role="alert">
          <h2>暂时无法加载信息与咨询</h2>
          <button type="button" onClick={() => void loadInformation()}>
            重试
          </button>
        </section>
      ) : null}

      {!loading && !loadError ? (
        <>
          <section aria-labelledby="announcements-heading">
            <header className="page-section-header">
              <div>
                <h2 id="announcements-heading">公开信息</h2>
                <p>集中查看面向同学发布的通知与说明。</p>
              </div>
            </header>
            {announcements.length === 0 ? (
              <section>
                <h3>目前没有公开信息</h3>
              </section>
            ) : (
              <ul className="record-list" aria-label="公开信息列表">
                {announcements.map((item) => (
                  <li key={item.id} className="record-card">
                    <article>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="consultation-form-heading">
            <h2 id="consultation-form-heading">提交咨询</h2>
            <p>问题将由对应负责同学跟进，身份与个人范围由服务端确定。</p>
            <form onSubmit={submitConsultation} noValidate>
              <label>
                咨询标题
                <input
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                咨询内容
                <textarea
                  value={body}
                  maxLength={20000}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              {formError ? <p role="alert">{formError}</p> : null}
              {feedback ? <p role="status">{feedback}</p> : null}
              <button type="submit" disabled={pending}>
                {pending ? '正在提交…' : '提交咨询'}
              </button>
            </form>
          </section>

          <section aria-labelledby="my-consultations-heading">
            <h2 id="my-consultations-heading">我的咨询</h2>
            {consultations.length === 0 ? (
              <p>你还没有提交咨询。</p>
            ) : (
              <ul className="record-list" aria-label="我的咨询列表">
                {consultations.map((item) => (
                  <li key={item.id} className="record-card">
                    <article>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                      <span className="status-badge">{consultationStatus[item.status]}</span>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
