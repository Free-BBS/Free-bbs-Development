import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { createApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

interface MilestoneRecord {
  id: string;
  occursAt: string;
  title: string;
  type: string;
  description: string;
  completed: boolean;
  displayOrder: number;
}

interface FixtureRecord {
  id: string;
  round: string;
  participantA: string;
  participantB: string;
  scheduledAt: string;
  location: string;
  score: string | null;
}

interface ActivityDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  organizationId: string | null;
  standingActivity: boolean;
  clubId: string | null;
  ownerUid: string;
  scope: ScopeRef;
  milestones: MilestoneRecord[];
  fixtures: FixtureRecord[];
  progress: { completed: number; total: number; percentage: number } | null;
}

interface RegistrationRecord {
  status: 'registered' | 'cancelled';
}

interface PagePolicy {
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  scope?: ScopeRef;
}

type PageUser = UserContext & { policies?: readonly PagePolicy[] };

export interface ActivityDetailPageProps {
  activityId: string;
  client?: DevelopmentApi;
  user?: PageUser | null;
}

const organizationLabels: Record<string, string> = {
  arts_center: '文艺中心',
  liaison_center: '联络中心',
  sports_center: '体育中心',
  rights_development_center: '权益发展中心',
  tuanwei: '团委',
  sast: '科协',
  tms: 'TMS',
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '未知错误';
}

function formatDateTime(value: string | null): string {
  if (value === null) return '待定';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function matches(pattern: string, value: string): boolean {
  return (
    pattern === '*' ||
    pattern === value ||
    (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)))
  );
}

function permitted(
  user: PageUser | null,
  action: string,
  resource: string,
  scope: ScopeRef,
): boolean {
  if (user === null) return false;
  const policies = (user.policies ?? []).filter(
    (policy) =>
      matches(policy.action, action) &&
      matches(policy.resource, resource) &&
      (policy.scope === undefined ||
        (policy.scope.type === scope.type && policy.scope.id === scope.id)),
  );
  return (
    !policies.some(({ effect }) => effect === 'deny') &&
    policies.some(({ effect }) => effect === 'allow')
  );
}

export function ActivityDetailPage({
  activityId,
  client,
  user: suppliedUser,
}: ActivityDetailPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as PageUser | null) ?? null) : suppliedUser;
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [registration, setRegistration] = useState<RegistrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await activeClient.request<ActivityDetail>(
        `/events/activities/${encodeURIComponent(activityId)}`,
      );
      setDetail(loaded);
      const registrationScope = { type: 'activity', id: activityId } as const;
      if (
        loaded.status === 'published' &&
        permitted(user, 'events.register', 'activity_registration', registrationScope)
      ) {
        setRegistration(
          await activeClient.request<RegistrationRecord | null>(
            `/events/activities/${encodeURIComponent(activityId)}/registrations`,
          ),
        );
      } else {
        setRegistration(null);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeClient, activityId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateRegistration(method: 'POST' | 'DELETE') {
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      await activeClient.request(
        `/events/activities/${encodeURIComponent(activityId)}/registrations`,
        method === 'POST'
          ? {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            }
          : { method },
      );
      setFeedback(method === 'POST' ? '报名成功' : '报名已取消');
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">正在加载活动详情…</p>;
  if (error !== null && detail === null) return <p role="alert">活动详情加载失败：{error}</p>;
  if (detail === null) return null;

  const registrationScope = { type: 'activity', id: activityId } as const;
  const canRegister = permitted(
    user,
    'events.register',
    'activity_registration',
    registrationScope,
  );
  const canCancel = permitted(
    user,
    'events.cancel_registration',
    'activity_registration',
    registrationScope,
  );

  return (
    <section className="module-page" aria-labelledby="activity-detail-title">
      <Link to="/events">← 返回活动列表</Link>
      <header className="page-section-header">
        <div>
          <p className="eyebrow">{detail.standingActivity ? '常设活动' : '活动详情'}</p>
          <h2 id="activity-detail-title">{detail.title}</h2>
          <p>{detail.description}</p>
        </div>
      </header>

      {feedback !== null ? <p role="status">{feedback}</p> : null}
      {error !== null ? <p role="alert">{error}</p> : null}

      <dl>
        <div>
          <dt>时间</dt>
          <dd>
            {formatDateTime(detail.startsAt)} — {formatDateTime(detail.endsAt)}
          </dd>
        </div>
        <div>
          <dt>地点</dt>
          <dd>{detail.location || '待定'}</dd>
        </div>
        <div>
          <dt>主办组织</dt>
          <dd>
            {detail.organizationId === null
              ? '平台'
              : (organizationLabels[detail.organizationId] ?? detail.organizationId)}
          </dd>
        </div>
      </dl>

      {detail.progress !== null ? (
        <section aria-labelledby="activity-progress-title">
          <h3 id="activity-progress-title">筹备进度</h3>
          <div
            role="progressbar"
            aria-label="活动筹备进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={detail.progress.percentage}
          >
            <span style={{ width: `${detail.progress.percentage}%` }} />
          </div>
          <p>
            已完成 {detail.progress.completed} / {detail.progress.total} 项（
            {detail.progress.percentage}%）
          </p>
        </section>
      ) : null}

      <section aria-labelledby="activity-timeline-title">
        <h3 id="activity-timeline-title">活动时间线</h3>
        {detail.milestones.length === 0 ? (
          <p>时间线待发布</p>
        ) : (
          <ol aria-label="活动时间线">
            {detail.milestones.map((milestone) => (
              <li key={milestone.id}>
                <time dateTime={milestone.occursAt}>{formatDateTime(milestone.occursAt)}</time>
                <strong>{milestone.title}</strong>
                <span>{milestone.completed ? '已完成' : '待进行'}</span>
                <p>{milestone.description}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {detail.fixtures.length > 0 ? (
        <section aria-labelledby="competition-preview-title">
          <h3 id="competition-preview-title">比赛预览</h3>
          <table aria-label="比赛预览">
            <thead>
              <tr>
                <th>轮次</th>
                <th>对阵</th>
                <th>时间</th>
                <th>地点</th>
                <th>比分</th>
              </tr>
            </thead>
            <tbody>
              {detail.fixtures.map((fixture) => (
                <tr key={fixture.id}>
                  <td>{fixture.round}</td>
                  <td>
                    {fixture.participantA} vs {fixture.participantB}
                  </td>
                  <td>{formatDateTime(fixture.scheduledAt)}</td>
                  <td>{fixture.location}</td>
                  <td>{fixture.score ?? '未开始'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {detail.status === 'published' && canRegister ? (
        registration?.status === 'registered' && canCancel ? (
          <button type="button" disabled={busy} onClick={() => void updateRegistration('DELETE')}>
            取消报名
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void updateRegistration('POST')}>
            报名活动
          </button>
        )
      ) : null}
    </section>
  );
}
