import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { createApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

type ActivityStatus =
  'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'finished' | 'archived';
type TechnicalSupportStatus = 'not_requested' | 'requested' | 'confirmed';

interface ActivityRecord {
  id: string;
  title: string;
  description: string;
  status: ActivityStatus;
  clubId: string | null;
  startsAt: string | null;
  endsAt?: string | null;
  location?: string;
  organizationId?: string | null;
  standingActivity?: boolean;
  technicalSupportStatus: TechnicalSupportStatus;
  technicalSupportNote: string | null;
  ownerUid: string;
  scope: ScopeRef;
}
interface RegistrationRecord {
  id: string;
  activityId: string;
  participantUid: string;
  status: 'registered' | 'cancelled';
}
interface PagePolicy {
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  scope?: ScopeRef;
}
type PageUser = UserContext & { policies?: readonly PagePolicy[] };

export interface EventsPageProps {
  client?: DevelopmentApi;
  user?: PageUser | null;
}

const publicScope = { type: 'public', id: '*' } as const;
const statusLabels: Record<ActivityStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已批准',
  rejected: '已驳回',
  published: '已发布',
  finished: '已结束',
  archived: '已归档',
};
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
function formatStart(value: string | null): string {
  if (value === null) return '时间待定';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
function localDateTimeValue(value: string | null): string {
  if (value === null) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function isoDateTimeValue(value: string): string | null {
  return value === '' ? null : new Date(value).toISOString();
}
function matches(pattern: string, value: string): boolean {
  return (
    pattern === '*' ||
    pattern === value ||
    (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)))
  );
}
function sameScope(left: ScopeRef | undefined, right: ScopeRef): boolean {
  return left === undefined || (left.type === right.type && left.id === right.id);
}
function permitted(
  user: PageUser | null,
  action: string,
  resource: 'activity' | 'activity_registration',
  scope: ScopeRef,
): boolean {
  if (user === null) return false;
  const policies = (user.policies ?? []).filter(
    (policy) =>
      matches(policy.action, action) &&
      matches(policy.resource, resource) &&
      sameScope(policy.scope, scope),
  );
  if (policies.some((policy) => policy.effect === 'deny')) return false;
  return policies.some((policy) => policy.effect === 'allow');
}

export function EventsPage({ client, user: suppliedUser }: EventsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as PageUser | null) ?? null) : suppliedUser;
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, RegistrationRecord | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActivityId, setBusyActivityId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editClubId, setEditClubId] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createClubId, setCreateClubId] = useState('');
  const [createStartsAt, setCreateStartsAt] = useState('');
  const [createEndsAt, setCreateEndsAt] = useState('');
  const [createLocation, setCreateLocation] = useState('');
  const [createOrganizationId, setCreateOrganizationId] = useState('');
  const [createStanding, setCreateStanding] = useState(false);
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});
  const organizationOptions = (user?.tags ?? [])
    .map(({ key }) => (key.startsWith('social_org.') ? key.slice('social_org.'.length) : null))
    .filter((value): value is string => value !== null);

  const loadActivities = useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await activeClient.request<ActivityRecord[]>('/events/activities');
      const loadedRegistrations = await Promise.all(
        loaded.map(async (activity) => {
          const routeScope = { type: 'activity', id: activity.id } as const;
          if (
            activity.status !== 'published' ||
            !permitted(user, 'events.register', 'activity_registration', routeScope)
          ) {
            return [activity.id, null] as const;
          }
          const registration = await activeClient.request<RegistrationRecord | null>(
            `/events/activities/${encodeURIComponent(activity.id)}/registrations`,
          );
          return [activity.id, registration] as const;
        }),
      );
      setActivities(loaded);
      setRegistrations(Object.fromEntries(loadedRegistrations));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [activeClient, user]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  async function runAction(
    activity: ActivityRecord,
    success: string,
    operation: () => Promise<unknown>,
  ) {
    setBusyActivityId(activity.id);
    setFeedback(null);
    setActionError(null);
    try {
      await operation();
      setFeedback(success);
      await loadActivities();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyActivityId(null);
    }
  }

  function beginEdit(activity: ActivityRecord) {
    setEditingId(activity.id);
    setEditTitle(activity.title);
    setEditDescription(activity.description);
    setEditClubId(activity.clubId ?? '');
    setEditStartsAt(localDateTimeValue(activity.startsAt));
    setEditEndsAt(localDateTimeValue(activity.endsAt ?? null));
    setEditLocation(activity.location ?? '');
  }

  async function saveEdit(activity: ActivityRecord, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = editTitle.trim();
    const description = editDescription.trim();
    if (!title || !description) {
      setActionError('活动名称和介绍不能为空');
      return;
    }
    await runAction(activity, '活动内容已保存', async () => {
      await activeClient.request('/events/activities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activity.id,
          title,
          description,
          clubId: editClubId.trim() || null,
          startsAt: isoDateTimeValue(editStartsAt),
          endsAt: isoDateTimeValue(editEndsAt),
          location: editLocation.trim(),
        }),
      });
      setEditingId(null);
    });
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = createTitle.trim();
    const description = createDescription.trim();
    if (!title || !description) {
      setActionError('活动名称和介绍不能为空');
      return;
    }
    setBusyActivityId('new');
    setActionError(null);
    try {
      await activeClient.request('/events/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          clubId: createClubId.trim() || null,
          startsAt: isoDateTimeValue(createStartsAt),
          endsAt: isoDateTimeValue(createEndsAt),
          location: createLocation.trim(),
          organizationId: createOrganizationId || organizationOptions[0] || null,
          standingActivity: createStanding,
          status: 'draft',
          scope: publicScope,
        }),
      });
      setCreateTitle('');
      setCreateDescription('');
      setCreateClubId('');
      setCreateStartsAt('');
      setCreateEndsAt('');
      setCreateLocation('');
      setCreateOrganizationId('');
      setCreateStanding(false);
      setFeedback('活动草稿已创建');
      await loadActivities();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyActivityId(null);
    }
  }

  async function transition(activity: ActivityRecord, to: ActivityStatus, success: string) {
    if ((to === 'rejected' || to === 'archived') && !window.confirm(`确定${success}吗？`)) return;
    await runAction(activity, success, () =>
      activeClient.request(`/events/activities/${encodeURIComponent(activity.id)}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      }),
    );
  }

  async function updateSupport(activity: ActivityRecord, to: 'requested' | 'confirmed') {
    await runAction(activity, to === 'requested' ? '技术支持已申请' : '技术支持已确认', () =>
      activeClient.request(
        `/events/activities/${encodeURIComponent(activity.id)}/technical-support`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            note: supportNotes[activity.id] ?? activity.technicalSupportNote ?? undefined,
          }),
        },
      ),
    );
  }

  async function register(activity: ActivityRecord) {
    await runAction(activity, '报名成功', () =>
      activeClient.request(`/events/activities/${encodeURIComponent(activity.id)}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
  }

  async function cancel(activity: ActivityRecord) {
    if (!window.confirm(`确定取消“${activity.title}”的报名吗？`)) return;
    await runAction(activity, '报名已取消', () =>
      activeClient.request<void>(
        `/events/activities/${encodeURIComponent(activity.id)}/registrations`,
        { method: 'DELETE' },
      ),
    );
  }

  const canCreate = permitted(user, 'events.create', 'activity', publicScope);

  return (
    <section className="module-page" aria-labelledby="events-title">
      <h2 id="events-title">活动</h2>
      <p>从活动草稿、审核、发布到报名和归档，全程使用服务器确认的状态。</p>

      {feedback !== null && <p role="status">{feedback}</p>}
      {actionError !== null && <p role="alert">{actionError}</p>}
      {activities === null && loadError === null && <p role="status">正在加载活动…</p>}
      {loadError !== null && <p role="alert">活动加载失败：{loadError}</p>}
      {activities?.length === 0 && <p>暂无活动</p>}

      {activities !== null && activities.length > 0 ? (
        <div className="workbench-grid">
          {activities.map((activity) => {
            const canUpdate = permitted(user, 'events.update', 'activity', activity.scope);
            const canCreateOwn =
              activity.ownerUid === user?.uid &&
              permitted(user, 'events.create', 'activity', activity.scope);
            const canManageCreatorEdge = canUpdate || canCreateOwn;
            const canApprove = permitted(user, 'events.approve', 'activity', activity.scope);
            const canSupport = permitted(
              user,
              'events.technical_support',
              'activity',
              activity.scope,
            );
            const registrationScope = { type: 'activity', id: activity.id } as const;
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
            const registration = registrations[activity.id];
            const registered = registration?.status === 'registered';
            const busy = busyActivityId === activity.id;
            const headingId = `activity-${activity.id}-title`;

            return (
              <article className="workbench-card" aria-labelledby={headingId} key={activity.id}>
                <span
                  className="status-badge"
                  data-status={activity.status === 'published' ? 'success' : 'warning'}
                >
                  {statusLabels[activity.status]}
                </span>
                <h3 id={headingId}>{activity.title}</h3>
                <p>{activity.description}</p>
                <p>开始时间：{formatStart(activity.startsAt)}</p>
                {activity.endsAt ? <p>结束时间：{formatStart(activity.endsAt)}</p> : null}
                <p>地点：{activity.location || '待定'}</p>
                <p>
                  主办：
                  {activity.organizationId
                    ? (organizationLabels[activity.organizationId] ?? activity.organizationId)
                    : '平台'}
                </p>
                <Link to={`/events/${encodeURIComponent(activity.id)}`}>查看详情与时间线</Link>
                {activity.clubId !== null ? (
                  <Link to="/interest-groups">查看所属趣缘群体</Link>
                ) : null}

                {editingId === activity.id ? (
                  <form onSubmit={(event) => void saveEdit(activity, event)}>
                    <label>
                      活动名称
                      <input
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      活动介绍
                      <textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                      />
                    </label>
                    <label>
                      所属趣缘群体 ID（可选）
                      <input
                        value={editClubId}
                        onChange={(event) => setEditClubId(event.target.value)}
                      />
                    </label>
                    <label>
                      开始时间（可选）
                      <input
                        type="datetime-local"
                        value={editStartsAt}
                        onChange={(event) => setEditStartsAt(event.target.value)}
                      />
                    </label>
                    <label>
                      结束时间（可选）
                      <input
                        type="datetime-local"
                        value={editEndsAt}
                        onChange={(event) => setEditEndsAt(event.target.value)}
                      />
                    </label>
                    <label>
                      地点
                      <input
                        value={editLocation}
                        onChange={(event) => setEditLocation(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busy}>
                      保存活动
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      取消编辑
                    </button>
                  </form>
                ) : canManageCreatorEdge &&
                  (activity.status === 'draft' || activity.status === 'rejected') ? (
                  <button
                    type="button"
                    aria-label={`编辑${activity.title}`}
                    onClick={() => beginEdit(activity)}
                  >
                    编辑
                  </button>
                ) : null}

                <div className="action-row">
                  {canManageCreatorEdge && activity.status === 'draft' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void transition(activity, 'pending', '活动已提交审核')}
                    >
                      提交审核
                    </button>
                  ) : null}
                  {canApprove && activity.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void transition(activity, 'approved', '活动已批准')}
                      >
                        批准活动
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void transition(activity, 'rejected', '驳回活动')}
                      >
                        驳回活动
                      </button>
                    </>
                  ) : null}
                  {canManageCreatorEdge && activity.status === 'rejected' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void transition(activity, 'draft', '活动已转回草稿')}
                    >
                      修订为草稿
                    </button>
                  ) : null}
                  {canUpdate && activity.status === 'approved' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void transition(activity, 'published', '活动已发布')}
                    >
                      发布活动
                    </button>
                  ) : null}
                  {canUpdate && activity.status === 'published' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void transition(activity, 'finished', '活动已结束')}
                    >
                      结束活动
                    </button>
                  ) : null}
                  {canUpdate && activity.status === 'finished' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void transition(activity, 'archived', '归档活动')}
                    >
                      归档活动
                    </button>
                  ) : null}
                </div>

                {activity.status === 'published' && canRegister ? (
                  registered && canCancel ? (
                    <button type="button" disabled={busy} onClick={() => void cancel(activity)}>
                      取消报名
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void register(activity)}>
                      报名活动
                    </button>
                  )
                ) : null}

                {canUpdate || canSupport ? (
                  <section aria-label={`${activity.title}技术支持`}>
                    <h4>技术支持</h4>
                    <p>
                      {activity.technicalSupportStatus === 'not_requested'
                        ? '尚未申请'
                        : activity.technicalSupportStatus === 'requested'
                          ? '等待确认'
                          : '已确认'}
                    </p>
                    {activity.technicalSupportStatus !== 'confirmed' ? (
                      <label>
                        支持说明
                        <input
                          value={supportNotes[activity.id] ?? activity.technicalSupportNote ?? ''}
                          onChange={(event) =>
                            setSupportNotes((current) => ({
                              ...current,
                              [activity.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    {canUpdate && activity.technicalSupportStatus === 'not_requested' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void updateSupport(activity, 'requested')}
                      >
                        申请技术支持
                      </button>
                    ) : null}
                    {canSupport && activity.technicalSupportStatus === 'requested' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void updateSupport(activity, 'confirmed')}
                      >
                        确认技术支持
                      </button>
                    ) : null}
                  </section>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {canCreate ? (
        <section aria-labelledby="event-create-title">
          <h2 id="event-create-title">创建活动草稿</h2>
          <form onSubmit={createActivity}>
            <label>
              新活动名称
              <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} />
            </label>
            <label>
              新活动介绍
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
              />
            </label>
            <label>
              所属趣缘群体 ID（可选）
              <input
                value={createClubId}
                onChange={(event) => setCreateClubId(event.target.value)}
              />
            </label>
            <label>
              开始时间（可选）
              <input
                type="datetime-local"
                value={createStartsAt}
                onChange={(event) => setCreateStartsAt(event.target.value)}
              />
            </label>
            <label>
              结束时间（可选）
              <input
                type="datetime-local"
                value={createEndsAt}
                onChange={(event) => setCreateEndsAt(event.target.value)}
              />
            </label>
            <label>
              地点
              <input
                value={createLocation}
                onChange={(event) => setCreateLocation(event.target.value)}
              />
            </label>
            {organizationOptions.length > 1 ? (
              <label>
                主办组织
                <select
                  value={createOrganizationId}
                  onChange={(event) => setCreateOrganizationId(event.target.value)}
                >
                  <option value="">选择主办组织</option>
                  {organizationOptions.map((organizationId) => (
                    <option value={organizationId} key={organizationId}>
                      {organizationLabels[organizationId] ?? organizationId}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={createStanding}
                onChange={(event) => setCreateStanding(event.target.checked)}
              />
              常设活动
            </label>
            <button type="submit" disabled={busyActivityId === 'new'}>
              保存草稿
            </button>
          </form>
        </section>
      ) : null}
    </section>
  );
}
