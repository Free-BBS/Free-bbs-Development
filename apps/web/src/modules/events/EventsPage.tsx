import { useCallback, useEffect, useMemo, useState } from 'react';

import { createApiClient } from '../../core/api/client.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

interface ActivityRecord {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
  clubId?: string | null;
  startsAt?: string | null;
}

export interface EventsPageProps {
  client?: DevelopmentApi;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function formatStart(value: string | null | undefined): string {
  if (value === null || value === undefined) return '时间待定';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function EventsPage({ client }: EventsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActivityId, setBusyActivityId] = useState<string | null>(null);
  const [registeredIds, setRegisteredIds] = useState<ReadonlySet<string>>(new Set());

  const loadActivities = useCallback(async () => {
    setLoadError(null);
    try {
      setActivities(await activeClient.request<ActivityRecord[]>('/events/activities'));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [activeClient]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  async function register(activity: ActivityRecord) {
    setBusyActivityId(activity.id);
    setFeedback(null);
    setActionError(null);
    try {
      await activeClient.request(
        `/events/activities/${encodeURIComponent(activity.id)}/registrations`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      setRegisteredIds((current) => new Set(current).add(activity.id));
      setFeedback(`已报名${activity.title}`);
      await loadActivities();
    } catch (error) {
      setActionError(`报名失败：${errorMessage(error)}`);
    } finally {
      setBusyActivityId(null);
    }
  }

  async function cancel(activity: ActivityRecord) {
    if (!window.confirm(`确定取消“${activity.title}”的报名吗？`)) return;
    setBusyActivityId(activity.id);
    setFeedback(null);
    setActionError(null);
    try {
      await activeClient.request<void>(
        `/events/activities/${encodeURIComponent(activity.id)}/registrations`,
        { method: 'DELETE' },
      );
      setRegisteredIds((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
      setFeedback(`已取消${activity.title}报名`);
      await loadActivities();
    } catch (error) {
      setActionError(`取消报名失败：${errorMessage(error)}`);
    } finally {
      setBusyActivityId(null);
    }
  }

  return (
    <section className="module-page" aria-labelledby="events-title">
      <h2 id="events-title">活动</h2>
      <p>查看即将开始的活动，在开放期内完成报名。</p>

      {feedback !== null && <p role="status">{feedback}</p>}
      {actionError !== null && <p role="alert">{actionError}</p>}
      {activities === null && loadError === null && <p role="status">正在加载活动…</p>}
      {loadError !== null && <p role="alert">活动加载失败：{loadError}</p>}
      {activities?.length === 0 && <p>暂无可报名的活动</p>}

      {activities !== null && activities.length > 0 && (
        <div className="workbench-grid">
          {activities.map((activity) => {
            const registered = registeredIds.has(activity.id);
            const headingId = `activity-${activity.id}-title`;
            return (
              <article className="workbench-card" aria-labelledby={headingId} key={activity.id}>
                <span
                  className="status-badge"
                  data-status={activity.status === 'open' ? 'success' : 'warning'}
                >
                  {activity.status === 'open' ? '报名中' : '不可报名'}
                </span>
                <h3 id={headingId}>{activity.title}</h3>
                <p>{activity.description}</p>
                <p>开始时间：{formatStart(activity.startsAt)}</p>
                {registered ? (
                  <button
                    type="button"
                    disabled={busyActivityId === activity.id}
                    onClick={() => void cancel(activity)}
                    aria-label={`取消${activity.title}报名`}
                  >
                    {busyActivityId === activity.id ? '处理中…' : '取消报名'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={activity.status !== 'open' || busyActivityId === activity.id}
                    onClick={() => void register(activity)}
                    aria-label={`报名${activity.title}`}
                  >
                    {busyActivityId === activity.id ? '处理中…' : '报名活动'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
