import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { EditorDrawer } from '../../components/EditorDrawer.js';
import { ModulePageHeader } from '../../components/ModulePageHeader.js';
import { ResponsiveRecordList } from '../../components/ResponsiveRecordList.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { createApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}
type ClubStatus = 'draft' | 'active' | 'archived';
type MembershipStatus = 'pending' | 'active' | 'rejected' | 'left';
type TechnicalSupportStatus = 'not_requested' | 'requested' | 'confirmed';
interface ClubRecord {
  id: string;
  category?: string;
  contactName?: string;
  publicContact?: string;
  name: string;
  description: string;
  status: ClubStatus;
  technicalSupportStatus: TechnicalSupportStatus;
  technicalSupportNote: string | null;
  scope: ScopeRef;
}
interface ActivityRecord {
  id: string;
  title: string;
  clubId: string | null;
  startsAt: string | null;
  status: string;
}
interface MembershipRecord {
  id: string;
  clubId: string;
  memberUid: string;
  status: MembershipStatus;
}
interface PagePolicy {
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  scope?: ScopeRef;
}
type PageUser = UserContext & { policies?: readonly PagePolicy[] };
export interface ClubsPageProps {
  client?: DevelopmentApi;
  user?: PageUser | null;
}

const statusLabels: Record<ClubStatus, string> = {
  draft: '草稿',
  active: '开放中',
  archived: '已归档',
};
const membershipLabels: Record<MembershipStatus, string> = {
  pending: '申请待审批',
  active: '已加入',
  rejected: '申请已拒绝',
  left: '已退出',
};
const publicScope = { type: 'public', id: '*' } as const;
const errorMessage = (error: unknown) =>
  error instanceof Error && error.message.trim() ? error.message : '未知错误';
const matches = (pattern: string, value: string) =>
  pattern === '*' ||
  pattern === value ||
  (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)));
const sameScope = (left: ScopeRef | undefined, right: ScopeRef) =>
  left === undefined || (left.type === right.type && left.id === right.id);
function permitted(
  user: PageUser | null,
  action: string,
  resource: 'club' | 'club_membership',
  scope: ScopeRef,
): boolean {
  if (user === null) return false;
  const policies = (user.policies ?? []).filter(
    (policy) =>
      matches(policy.action, action) &&
      matches(policy.resource, resource) &&
      sameScope(policy.scope, scope),
  );
  return (
    !policies.some((policy) => policy.effect === 'deny') &&
    policies.some((policy) => policy.effect === 'allow')
  );
}

export function ClubsPage({ client, user: suppliedUser }: ClubsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedGroup = searchParams.get('group');
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as PageUser | null) ?? null) : suppliedUser;
  const [clubs, setClubs] = useState<ClubRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [memberships, setMemberships] = useState<Record<string, MembershipRecord[]>>({});
  const [membershipUnavailable, setMembershipUnavailable] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyClubId, setBusyClubId] = useState<string | null>(null);
  const [drawerClub, setDrawerClub] = useState<ClubRecord | 'create' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [contactName, setContactName] = useState('');
  const [publicContact, setPublicContact] = useState('');
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});
  const loadClubs = useCallback(
    async (announceLoading = true) => {
      if (announceLoading) setState('loading');
      setLoadError('');
      try {
        const [loaded, loadedActivities] = await Promise.all([
          activeClient.request<ClubRecord[]>('/interest-groups'),
          activeClient.request<ActivityRecord[]>('/events/activities'),
        ]);
        const loadedMemberships = await Promise.all(
          loaded.map(async (club) => {
            const canRead =
              permitted(user, 'clubs.update', 'club', club.scope) ||
              permitted(user, 'clubs.join', 'club_membership', { type: 'club', id: club.id });
            if (!canRead) return [club.id, [] as MembershipRecord[], false] as const;
            try {
              return [
                club.id,
                await activeClient.request<MembershipRecord[]>(
                  `/interest-groups/${encodeURIComponent(club.id)}/memberships`,
                ),
                false,
              ] as const;
            } catch {
              return [club.id, [] as MembershipRecord[], true] as const;
            }
          }),
        );
        setClubs(loaded);
        setActivities(loadedActivities.filter((activity) => activity.status === 'published'));
        setMemberships(
          Object.fromEntries(loadedMemberships.map(([clubId, rows]) => [clubId, rows])),
        );
        setMembershipUnavailable(
          Object.fromEntries(
            loadedMemberships.map(([clubId, , unavailable]) => [clubId, unavailable]),
          ),
        );
        setState('ready');
      } catch (error) {
        setLoadError(errorMessage(error));
        setState('error');
      }
    },
    [activeClient, user],
  );
  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);
  function openDrawer(club: ClubRecord | 'create') {
    setFeedback(null);
    setActionError(null);
    setDrawerClub(club);
    setName(club === 'create' ? '' : club.name);
    setDescription(club === 'create' ? '' : club.description);
    setCategory(club === 'create' ? 'general' : (club.category ?? 'general'));
    setContactName(club === 'create' ? '' : (club.contactName ?? ''));
    setPublicContact(club === 'create' ? '' : (club.publicContact ?? ''));
  }
  async function runAction(club: ClubRecord, success: string, operation: () => Promise<unknown>) {
    setBusyClubId(club.id);
    setFeedback(null);
    setActionError(null);
    try {
      await operation();
      setFeedback(success);
      await loadClubs(false);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyClubId(null);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !description.trim()) {
      setActionError('名称和介绍不能为空');
      return;
    }
    const creating = drawerClub === 'create';
    const existing = drawerClub !== null && drawerClub !== 'create' ? drawerClub : null;
    setBusyClubId(creating ? 'new' : existing!.id);
    setActionError(null);
    try {
      await activeClient.request('/interest-groups', {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          creating
            ? {
                name: name.trim(),
                description: description.trim(),
                category: category.trim() || 'general',
                contactName: contactName.trim(),
                publicContact: publicContact.trim(),
                status: 'draft',
                scope: publicScope,
              }
            : {
                id: existing!.id,
                name: name.trim(),
                description: description.trim(),
                category: category.trim() || 'general',
                contactName: contactName.trim(),
                publicContact: publicContact.trim(),
                scope: existing!.scope,
              },
        ),
      });
      setDrawerClub(null);
      setFeedback(creating ? '趣缘群体草稿已创建' : '趣缘群体信息已保存');
      await loadClubs(false);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyClubId(null);
    }
  }
  async function transition(club: ClubRecord, to: 'active' | 'archived') {
    if (busyClubId === club.id) return;
    const label = to === 'archived' ? '归档' : club.status === 'archived' ? '恢复' : '启用';
    if (!globalThis.confirm(`确认${label}“${club.name}”吗？`)) return;
    await runAction(club, `已${label}${club.name}`, () =>
      activeClient.request(`/interest-groups/${encodeURIComponent(club.id)}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      }),
    );
  }
  async function join(club: ClubRecord) {
    if (busyClubId === club.id) return;
    await runAction(club, `已提交${club.name}加入申请`, () =>
      activeClient.request(`/interest-groups/${encodeURIComponent(club.id)}/memberships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
  }
  async function leave(club: ClubRecord, pending: boolean) {
    if (busyClubId === club.id) return;
    const action = pending ? '撤回申请' : '退出趣缘群体';
    if (!globalThis.confirm(`确认${action}“${club.name}”吗？`)) return;
    await runAction(club, pending ? '申请已撤回' : `已退出${club.name}`, () =>
      activeClient.request(`/interest-groups/${encodeURIComponent(club.id)}/memberships`, {
        method: 'DELETE',
      }),
    );
  }
  async function decideMembership(
    club: ClubRecord,
    membership: MembershipRecord,
    status: 'active' | 'rejected',
  ) {
    if (busyClubId === club.id) return;
    if (status === 'rejected' && !globalThis.confirm(`确认拒绝 ${membership.memberUid} 的申请吗？`))
      return;
    await runAction(club, status === 'active' ? '会员申请已批准' : '会员申请已拒绝', () =>
      activeClient.request(
        `/interest-groups/${encodeURIComponent(club.id)}/memberships/${encodeURIComponent(membership.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      ),
    );
  }
  async function updateSupport(club: ClubRecord, status: 'requested' | 'confirmed') {
    if (busyClubId === club.id) return;
    await runAction(club, status === 'requested' ? '技术支持申请已提交' : '技术支持已确认', () =>
      activeClient.request(`/interest-groups/${encodeURIComponent(club.id)}/technical-support`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: supportNotes[club.id] ?? club.technicalSupportNote }),
      }),
    );
  }
  const canCreate = permitted(user, 'clubs.create', 'club', publicScope);
  return (
    <section className="module-page" aria-label="趣缘群体">
      <ModulePageHeader
        title="趣缘群体"
        description="找到志趣相投的伙伴，一起参与校园活动。"
        actions={
          canCreate ? (
            <button type="button" onClick={() => openDrawer('create')}>
              新建趣缘群体
            </button>
          ) : undefined
        }
      />
      {selectedGroup && (
        <p className="group-filter-notice">
          正在查看推荐群体。
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('group');
              setSearchParams(next);
            }}
          >
            查看全部趣缘群体
          </button>
        </p>
      )}
      {feedback ? <p role="status">{feedback}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      <ResponsiveRecordList
        ariaLabel="趣缘群体列表"
        className="group-card-grid"
        records={selectedGroup ? clubs.filter((club) => club.id === selectedGroup) : clubs}
        state={state}
        errorMessage={`趣缘群体加载失败：${loadError}`}
        emptyTitle="暂无可查看的趣缘群体"
        getKey={(club) => club.id}
        renderRecord={(club) => {
          const rows = memberships[club.id] ?? [];
          const membershipIsUnavailable = membershipUnavailable[club.id] === true;
          const own = rows.find((row) => row.memberUid === user?.uid);
          const canMaintain = permitted(user, 'clubs.update', 'club', club.scope);
          const canSupport = permitted(user, 'clubs.technical_support', 'club', club.scope);
          const canJoin = permitted(user, 'clubs.join', 'club_membership', {
            type: 'club',
            id: club.id,
          });
          const related = activities.filter((activity) => activity.clubId === club.id);
          return (
            <article
              className="record-card workbench-card"
              aria-labelledby={`club-${club.id}-title`}
            >
              <header>
                <div>
                  <p className="record-eyebrow">{club.category ?? 'general'}</p>
                  <h3 id={`club-${club.id}-title`}>{club.name}</h3>
                </div>
                <StatusBadge
                  status={
                    club.status === 'active'
                      ? 'success'
                      : club.status === 'draft'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {statusLabels[club.status]}
                </StatusBadge>
              </header>
              <p>{club.description}</p>
              {club.contactName || club.publicContact ? (
                <p className="record-meta">
                  {[club.contactName, club.publicContact].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              <section aria-label={`${club.name}公开活动`}>
                <h4>公开活动</h4>
                {related.length === 0 ? (
                  <p>暂无公开活动</p>
                ) : (
                  <ul>
                    {related.map((activity) => (
                      <li key={activity.id}>
                        <Link to="/events">{activity.title}</Link>
                        {activity.startsAt
                          ? ` · ${new Date(activity.startsAt).toLocaleString()}`
                          : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {canMaintain ? (
                <div>
                  <button
                    type="button"
                    aria-label={`编辑${club.name}`}
                    onClick={() => openDrawer(club)}
                  >
                    编辑
                  </button>
                  {club.status === 'active' ? (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`归档${club.name}`}
                      onClick={() => void transition(club, 'archived')}
                    >
                      归档
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`${club.status === 'archived' ? '恢复' : '启用'}${club.name}`}
                      onClick={() => void transition(club, 'active')}
                    >
                      {club.status === 'archived' ? '恢复' : '启用'}
                    </button>
                  )}
                </div>
              ) : null}
              {canJoin ? (
                <section aria-label={`${club.name}会员状态`}>
                  {membershipIsUnavailable ? <p>会员状态暂不可用</p> : null}
                  {!membershipIsUnavailable && own ? <p>{membershipLabels[own.status]}</p> : null}
                  {!membershipIsUnavailable &&
                  club.status === 'active' &&
                  (!own || own.status === 'left' || own.status === 'rejected') ? (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`${own ? '重新申请' : '加入'}${club.name}`}
                      onClick={() => void join(club)}
                    >
                      {own ? '重新申请' : '申请加入'}
                    </button>
                  ) : null}
                  {!membershipIsUnavailable && own?.status === 'pending' ? (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`撤回${club.name}申请`}
                      onClick={() => void leave(club, true)}
                    >
                      撤回申请
                    </button>
                  ) : null}
                  {!membershipIsUnavailable && own?.status === 'active' ? (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`退出${club.name}`}
                      onClick={() => void leave(club, false)}
                    >
                      退出趣缘群体
                    </button>
                  ) : null}
                </section>
              ) : null}
              {canMaintain ? (
                <section aria-label={`${club.name}会员队列`}>
                  <h4>会员申请与历史</h4>
                  {membershipIsUnavailable ? (
                    <p>会员状态暂不可用</p>
                  ) : rows.length === 0 ? (
                    <p>暂无会员记录</p>
                  ) : (
                    <ul>
                      {rows.map((membership) => (
                        <li key={membership.id}>
                          {membership.memberUid} · {membershipLabels[membership.status]}
                          {membership.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                disabled={busyClubId === club.id}
                                aria-label={`批准 ${membership.memberUid}`}
                                onClick={() => void decideMembership(club, membership, 'active')}
                              >
                                批准
                              </button>
                              <button
                                type="button"
                                disabled={busyClubId === club.id}
                                aria-label={`拒绝 ${membership.memberUid}`}
                                onClick={() => void decideMembership(club, membership, 'rejected')}
                              >
                                拒绝
                              </button>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
              {canSupport ? (
                <section aria-label={`${club.name}技术支持`}>
                  <h4>技术支持</h4>
                  <p>
                    {club.technicalSupportStatus === 'not_requested'
                      ? '尚未申请'
                      : club.technicalSupportStatus === 'requested'
                        ? '等待确认'
                        : '已确认'}
                  </p>
                  <label>
                    支持说明
                    <input
                      disabled={busyClubId === club.id}
                      value={supportNotes[club.id] ?? club.technicalSupportNote ?? ''}
                      onChange={(event) =>
                        setSupportNotes((current) => ({
                          ...current,
                          [club.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {club.technicalSupportStatus === 'not_requested' ? (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`申请${club.name}技术支持`}
                      onClick={() => void updateSupport(club, 'requested')}
                    >
                      申请技术支持
                    </button>
                  ) : club.technicalSupportStatus === 'requested' ? (
                    <button
                      type="button"
                      disabled={busyClubId === club.id}
                      aria-label={`确认${club.name}技术支持`}
                      onClick={() => void updateSupport(club, 'confirmed')}
                    >
                      确认支持
                    </button>
                  ) : null}
                </section>
              ) : null}
            </article>
          );
        }}
      />
      <EditorDrawer
        open={drawerClub !== null}
        title={drawerClub === 'create' ? '新建趣缘群体' : '编辑趣缘群体'}
        description="维护公开介绍与联络信息。"
        onClose={() => setDrawerClub(null)}
      >
        <form onSubmit={(event) => void save(event)}>
          <label>
            名称
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            介绍
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            类别
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
          <label>
            联系人
            <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
          </label>
          <label>
            公开联系人
            <input
              value={publicContact}
              onChange={(event) => setPublicContact(event.target.value)}
            />
          </label>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <button
            type="submit"
            disabled={
              busyClubId === 'new' ||
              busyClubId === (drawerClub !== null && drawerClub !== 'create' ? drawerClub.id : '')
            }
          >
            {drawerClub === 'create' ? '保存草稿' : '保存'}
          </button>
        </form>
      </EditorDrawer>
    </section>
  );
}
