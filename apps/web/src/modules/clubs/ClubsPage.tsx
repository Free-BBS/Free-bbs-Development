import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
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
  name: string;
  description: string;
  status: ClubStatus;
  technicalSupportStatus: TechnicalSupportStatus;
  technicalSupportNote: string | null;
  scope: ScopeRef;
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

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '未知错误';
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
  if (policies.some((policy) => policy.effect === 'deny')) return false;
  return policies.some((policy) => policy.effect === 'allow');
}

export function ClubsPage({ client, user: suppliedUser }: ClubsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as PageUser | null) ?? null) : suppliedUser;
  const [clubs, setClubs] = useState<ClubRecord[] | null>(null);
  const [memberships, setMemberships] = useState<Record<string, MembershipRecord[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyClubId, setBusyClubId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});

  const loadClubs = useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await activeClient.request<ClubRecord[]>('/clubs');
      const loadedMemberships = await Promise.all(
        loaded.map(async (club) => {
          const canReadMemberships =
            permitted(user, 'clubs.update', 'club', club.scope) ||
            permitted(user, 'clubs.join', 'club_membership', { type: 'club', id: club.id });
          if (!canReadMemberships) return [club.id, []] as const;
          const rows = await activeClient.request<MembershipRecord[]>(
            `/clubs/${encodeURIComponent(club.id)}/memberships`,
          );
          return [club.id, rows] as const;
        }),
      );
      setClubs(loaded);
      setMemberships(Object.fromEntries(loadedMemberships));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [activeClient, user]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  async function runAction(club: ClubRecord, success: string, operation: () => Promise<unknown>) {
    setBusyClubId(club.id);
    setFeedback(null);
    setActionError(null);
    try {
      await operation();
      setFeedback(success);
      await loadClubs();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyClubId(null);
    }
  }

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim();
    const description = createDescription.trim();
    if (!name || !description) {
      setActionError('名称和介绍不能为空');
      return;
    }
    setBusyClubId('new');
    setActionError(null);
    try {
      await activeClient.request('/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status: 'draft', scope: publicScope }),
      });
      setCreateName('');
      setCreateDescription('');
      setFeedback('俱乐部草稿已创建');
      await loadClubs();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyClubId(null);
    }
  }

  function beginEdit(club: ClubRecord) {
    setEditingId(club.id);
    setEditName(club.name);
    setEditDescription(club.description);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, club: ClubRecord) {
    event.preventDefault();
    if (!editName.trim() || !editDescription.trim()) {
      setActionError('名称和介绍不能为空');
      return;
    }
    await runAction(club, '俱乐部信息已保存', async () => {
      await activeClient.request('/clubs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: club.id,
          name: editName.trim(),
          description: editDescription.trim(),
          scope: club.scope,
        }),
      });
      setEditingId(null);
    });
  }

  async function transition(club: ClubRecord, to: 'active' | 'archived') {
    const label = to === 'archived' ? '归档' : club.status === 'archived' ? '恢复' : '启用';
    if (!globalThis.confirm(`确认${label}“${club.name}”吗？`)) return;
    await runAction(club, `已${label}${club.name}`, () =>
      activeClient.request(`/clubs/${encodeURIComponent(club.id)}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      }),
    );
  }

  async function join(club: ClubRecord) {
    await runAction(club, `已提交${club.name}加入申请`, () =>
      activeClient.request(`/clubs/${encodeURIComponent(club.id)}/memberships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
  }

  async function leave(club: ClubRecord, pending: boolean) {
    const action = pending ? '撤回申请' : '退出俱乐部';
    if (!globalThis.confirm(`确认${action}“${club.name}”吗？`)) return;
    await runAction(club, pending ? '申请已撤回' : `已退出${club.name}`, () =>
      activeClient.request<void>(`/clubs/${encodeURIComponent(club.id)}/memberships`, {
        method: 'DELETE',
      }),
    );
  }

  async function decideMembership(
    club: ClubRecord,
    membership: MembershipRecord,
    status: 'active' | 'rejected',
  ) {
    if (status === 'rejected' && !globalThis.confirm(`确认拒绝 ${membership.memberUid} 的申请吗？`))
      return;
    await runAction(club, status === 'active' ? '会员申请已批准' : '会员申请已拒绝', () =>
      activeClient.request(
        `/clubs/${encodeURIComponent(club.id)}/memberships/${encodeURIComponent(membership.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      ),
    );
  }

  async function updateSupport(club: ClubRecord, status: 'requested' | 'confirmed') {
    await runAction(club, status === 'requested' ? '技术支持申请已提交' : '技术支持已确认', () =>
      activeClient.request(`/clubs/${encodeURIComponent(club.id)}/technical-support`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: supportNotes[club.id] ?? club.technicalSupportNote }),
      }),
    );
  }

  const canCreate = permitted(user, 'clubs.create', 'club', publicScope);

  return (
    <section className="module-page" aria-labelledby="clubs-title">
      <header className="page-section-header">
        <div>
          <h2 id="clubs-title">社群与俱乐部</h2>
          <p>创建和维护社群，审批加入申请，并与活动模块协同。</p>
        </div>
      </header>

      {feedback ? <p role="status">{feedback}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {clubs === null && loadError === null ? <p role="status">正在加载俱乐部…</p> : null}
      {loadError ? <p role="alert">俱乐部加载失败：{loadError}</p> : null}
      {clubs?.length === 0 ? <p>暂无可查看的俱乐部</p> : null}

      {clubs && clubs.length > 0 ? (
        <div className="workbench-grid">
          {clubs.map((club) => {
            const rows = memberships[club.id] ?? [];
            const ownMembership = rows.find((row) => row.memberUid === user?.uid);
            const canMaintain = permitted(user, 'clubs.update', 'club', club.scope);
            const canSupport = permitted(user, 'clubs.technical_support', 'club', club.scope);
            const canJoin = permitted(user, 'clubs.join', 'club_membership', {
              type: 'club',
              id: club.id,
            });
            const headingId = `club-${club.id}-title`;
            return (
              <article className="workbench-card" aria-labelledby={headingId} key={club.id}>
                <span
                  className="status-badge"
                  data-status={club.status === 'active' ? 'success' : 'warning'}
                >
                  {statusLabels[club.status]}
                </span>
                <h3 id={headingId}>{club.name}</h3>

                {editingId === club.id ? (
                  <form onSubmit={(event) => void saveEdit(event, club)}>
                    <label>
                      名称
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </label>
                    <label>
                      介绍
                      <textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busyClubId === club.id}>
                      保存
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </form>
                ) : (
                  <p>{club.description}</p>
                )}

                <Link to="/events" aria-label={`查看${club.name}的活动`}>
                  查看相关活动
                </Link>

                {canMaintain && editingId !== club.id ? (
                  <div>
                    <button
                      type="button"
                      aria-label={`编辑${club.name}`}
                      onClick={() => beginEdit(club)}
                    >
                      编辑
                    </button>
                    {club.status === 'active' ? (
                      <button
                        type="button"
                        aria-label={`归档${club.name}`}
                        onClick={() => void transition(club, 'archived')}
                      >
                        归档
                      </button>
                    ) : (
                      <button
                        type="button"
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
                    {ownMembership ? <p>{membershipLabels[ownMembership.status]}</p> : null}
                    {club.status === 'active' &&
                    (!ownMembership ||
                      ownMembership.status === 'left' ||
                      ownMembership.status === 'rejected') ? (
                      <button
                        type="button"
                        disabled={busyClubId === club.id}
                        aria-label={`${ownMembership ? '重新申请' : '加入'}${club.name}`}
                        onClick={() => void join(club)}
                      >
                        {ownMembership ? '重新申请' : '申请加入'}
                      </button>
                    ) : null}
                    {ownMembership?.status === 'pending' ? (
                      <button
                        type="button"
                        aria-label={`撤回${club.name}申请`}
                        onClick={() => void leave(club, true)}
                      >
                        撤回申请
                      </button>
                    ) : null}
                    {ownMembership?.status === 'active' ? (
                      <button
                        type="button"
                        aria-label={`退出${club.name}`}
                        onClick={() => void leave(club, false)}
                      >
                        退出俱乐部
                      </button>
                    ) : null}
                  </section>
                ) : null}

                {canMaintain ? (
                  <section aria-label={`${club.name}会员队列`}>
                    <h4>会员申请与历史</h4>
                    {rows.length === 0 ? (
                      <p>暂无会员记录</p>
                    ) : (
                      <ul>
                        {rows.map((membership) => (
                          <li key={membership.id}>
                            <span>{membership.memberUid}</span>{' '}
                            <span>{membershipLabels[membership.status]}</span>
                            {membership.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={`批准 ${membership.memberUid}`}
                                  onClick={() => void decideMembership(club, membership, 'active')}
                                >
                                  批准
                                </button>
                                <button
                                  type="button"
                                  aria-label={`拒绝 ${membership.memberUid}`}
                                  onClick={() =>
                                    void decideMembership(club, membership, 'rejected')
                                  }
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
                        aria-label={`申请${club.name}技术支持`}
                        onClick={() => void updateSupport(club, 'requested')}
                      >
                        申请技术支持
                      </button>
                    ) : club.technicalSupportStatus === 'requested' ? (
                      <button
                        type="button"
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
          })}
        </div>
      ) : null}

      {canCreate ? (
        <section aria-labelledby="club-create-title">
          <h2 id="club-create-title">创建俱乐部草稿</h2>
          <form onSubmit={createClub}>
            <label>
              名称
              <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
            </label>
            <label>
              介绍
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busyClubId === 'new'}>
              保存草稿
            </button>
          </form>
        </section>
      ) : null}
    </section>
  );
}
