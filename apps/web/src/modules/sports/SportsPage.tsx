import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { createApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

type SportsTeamStatus = 'draft' | 'active' | 'archived';
interface SportsTeamRecord {
  id: string;
  name: string;
  description: string;
  status: SportsTeamStatus;
  ownerUid: string;
  scope: ScopeRef;
}
interface SportsTeamMemberRecord {
  id: string;
  teamId: string;
  memberUid: string;
  status: string;
  scope: ScopeRef;
  isCaptain: boolean;
}
interface SportsCheckinRecord {
  id: string;
  teamId: string;
  memberUid: string;
  checkinDate: string;
  status: string;
}
type RosterImportOutcome = 'ready' | 'already_member' | 'duplicate_in_file' | 'name_mismatch';
interface RosterPreviewRow {
  row: number;
  name: string;
  studentNumber: string;
  outcome: RosterImportOutcome;
  blocking: boolean;
}
interface RosterImportResult {
  imported: number;
  skipped: number;
  rows: RosterPreviewRow[];
}

interface SportsPolicy {
  action: string;
  resource: string;
  effect?: 'allow' | 'deny';
  scope?: ScopeRef;
  expiresAt?: string | null;
}
type SportsUser = UserContext & { policies?: readonly SportsPolicy[] };

export interface SportsPageProps {
  client?: DevelopmentApi;
  user?: SportsUser | null;
}

const statusLabels: Record<SportsTeamStatus, string> = {
  draft: '筹备中',
  active: '活跃',
  archived: '已归档',
};
const rosterLabels = {
  title: '\u6279\u91cf\u5bfc\u5165\u540d\u5355',
  choose: '\u9009\u62e9\u540d\u5355 CSV\uff08\u59d3\u540d,\u5b66\u53f7\uff09',
  help: '\u4ec5\u652f\u6301\u4e24\u5217\uff1a\u59d3\u540d\u3001\u5b66\u53f7\u3002\u8bf7\u5148\u9884\u89c8\uff0c\u518d\u786e\u8ba4\u5bfc\u5165\u3002',
  preview: '\u540d\u5355\u9884\u89c8',
  confirm: '\u786e\u8ba4\u5bfc\u5165',
  row: '\u884c',
  name: '\u59d3\u540d',
  studentNumber: '\u5b66\u53f7',
  outcome: '\u6821\u9a8c\u7ed3\u679c',
  complete: '\u540d\u5355\u5bfc\u5165\u5b8c\u6210',
  previewFailed: '\u540d\u5355\u9884\u89c8\u5931\u8d25',
  importFailed: '\u540d\u5355\u5bfc\u5165\u5931\u8d25',
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '未知错误';
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('CSV file could not be read as text'));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('CSV file could not be read'));
    });
    reader.readAsText(file, 'utf-8');
  });
}

function matches(pattern: string, value: string): boolean {
  return (
    pattern === '*' ||
    pattern === value ||
    (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)))
  );
}

function sameScope(grant: ScopeRef | undefined, requested: ScopeRef | undefined): boolean {
  if (grant === undefined) return true;
  return requested !== undefined && grant.type === requested.type && grant.id === requested.id;
}

function permitted(
  user: SportsUser | null,
  action: string,
  resource: 'sports_team' | 'sports_checkin',
  scope?: ScopeRef,
): boolean {
  if (user === null) return false;
  const now = Date.now();
  const matching = (user.policies ?? []).filter(
    (policy) =>
      matches(policy.action, action) &&
      matches(policy.resource, resource) &&
      sameScope(policy.scope, scope) &&
      (policy.expiresAt == null || Date.parse(policy.expiresAt) > now),
  );
  if (matching.some((policy) => policy.effect === 'deny')) return false;
  return matching.some((policy) => policy.effect !== 'deny');
}

function TeamCheckinForm({
  canCreate,
  client,
  onFeedback,
  team,
}: {
  canCreate: boolean;
  client: DevelopmentApi;
  onFeedback: (message: string, error?: boolean) => void;
  team: SportsTeamRecord;
}) {
  const [memberUid, setMemberUid] = useState('');
  const [checkinDate, setCheckinDate] = useState('');
  const [checkins, setCheckins] = useState<SportsCheckinRecord[] | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCheckins = useCallback(async () => {
    setCheckinError(null);
    try {
      setCheckins(
        await client.request<SportsCheckinRecord[]>(
          `/sports/teams/${encodeURIComponent(team.id)}/checkins`,
        ),
      );
    } catch (error) {
      setCheckinError(errorMessage(error));
    }
  }, [client, team.id]);

  useEffect(() => {
    void loadCheckins();
  }, [loadCheckins]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await client.request(`/sports/teams/${encodeURIComponent(team.id)}/checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberUid: memberUid.trim(), checkinDate }),
      });
      onFeedback('签到已记录');
      setMemberUid('');
      await loadCheckins();
    } catch (error) {
      onFeedback(`签到记录失败：${errorMessage(error)}`, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={`${team.name}签到管理`}>
      <h4>签到</h4>
      {canCreate ? (
        <form aria-label={`${team.name}签到`} onSubmit={(event) => void submit(event)}>
          <label>
            成员 UID
            <input
              required
              maxLength={128}
              value={memberUid}
              onChange={(event) => setMemberUid(event.currentTarget.value)}
            />
          </label>
          <label>
            签到日期
            <input
              required
              type="date"
              value={checkinDate}
              onChange={(event) => setCheckinDate(event.currentTarget.value)}
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? '正在记录…' : '记录签到'}
          </button>
        </form>
      ) : null}
      {checkins === null && checkinError === null && <p role="status">正在加载签到记录…</p>}
      {checkinError !== null && <p role="alert">签到记录加载失败：{checkinError}</p>}
      {checkins?.length === 0 && <p>暂无签到记录</p>}
      {checkins !== null && checkins.length > 0 && (
        <ul aria-label={`${team.name}签到记录`}>
          {checkins.map((checkin) => (
            <li key={checkin.id}>
              {checkin.memberUid}：{checkin.checkinDate}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RosterImport({
  client,
  onFeedback,
  onImported,
  team,
}: {
  client: DevelopmentApi;
  onFeedback: (message: string, error?: boolean) => void;
  onImported: () => Promise<void>;
  team: SportsTeamRecord;
}) {
  const [preview, setPreview] = useState<RosterPreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function previewFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file === undefined) return;
    setBusy(true);
    setPreview(null);
    try {
      const csv = await readTextFile(file);
      setPreview(
        await client.request<RosterPreviewRow[]>(
          `/sports/teams/${encodeURIComponent(team.id)}/roster-import/preview`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            body: csv,
          },
        ),
      );
    } catch (error) {
      onFeedback(`${rosterLabels.previewFailed}\uff1a${errorMessage(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (preview === null || preview.length === 0 || preview.some((row) => row.blocking)) return;
    setBusy(true);
    try {
      const rows = preview.map(({ row, name, studentNumber, outcome }) => ({
        row,
        name,
        studentNumber,
        outcome,
      }));
      const result = await client.request<RosterImportResult>(
        `/sports/teams/${encodeURIComponent(team.id)}/roster-import`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        },
      );
      setPreview(null);
      onFeedback(
        `${rosterLabels.complete}\uff1a\u65b0\u589e ${result.imported} \u4eba\uff0c\u8df3\u8fc7 ${result.skipped} \u4eba`,
      );
      await onImported();
    } catch (error) {
      onFeedback(`${rosterLabels.importFailed}\uff1a${errorMessage(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  const hasBlockingRows = preview?.some((row) => row.blocking) ?? false;
  const outcomeLabels: Record<RosterImportOutcome, string> = {
    ready: '\u53ef\u5bfc\u5165',
    already_member: '\u5df2\u5728\u961f\u4f0d\u4e2d',
    duplicate_in_file: '\u6587\u4ef6\u5185\u5b66\u53f7\u91cd\u590d',
    name_mismatch: '\u59d3\u540d\u4e0e\u73b0\u6709\u8d26\u53f7\u4e0d\u4e00\u81f4',
  };

  return (
    <section aria-label={`${team.name}${rosterLabels.title}`}>
      <h5>{rosterLabels.title}</h5>
      <label>
        {rosterLabels.choose}
        <input
          accept=".csv,text/csv"
          disabled={busy}
          type="file"
          onChange={(event) => void previewFile(event)}
        />
      </label>
      <p>{rosterLabels.help}</p>
      {preview !== null && (
        <>
          <table aria-label={`${team.name}${rosterLabels.preview}`}>
            <thead>
              <tr>
                <th>{rosterLabels.row}</th>
                <th>{rosterLabels.name}</th>
                <th>{rosterLabels.studentNumber}</th>
                <th>{rosterLabels.outcome}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={`${row.row}-${row.studentNumber}`}>
                  <td>{row.row}</td>
                  <td>{row.name}</td>
                  <td>{row.studentNumber}</td>
                  <td>{outcomeLabels[row.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            disabled={busy || preview.length === 0 || hasBlockingRows}
            onClick={() => void confirmImport()}
          >
            {rosterLabels.confirm}
          </button>
        </>
      )}
    </section>
  );
}

function TeamMemberManagement({
  canManage,
  client,
  onFeedback,
  team,
}: {
  canManage: boolean;
  client: DevelopmentApi;
  onFeedback: (message: string, error?: boolean) => void;
  team: SportsTeamRecord;
}) {
  const [members, setMembers] = useState<SportsTeamMemberRecord[] | null>(null);
  const [memberUid, setMemberUid] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadError(null);
    try {
      setMembers(
        await client.request<SportsTeamMemberRecord[]>(
          `/sports/teams/${encodeURIComponent(team.id)}/members`,
        ),
      );
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [client, team.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUid = memberUid.trim();
    if (!cleanUid) return;
    setBusyUid('new');
    try {
      await client.request(`/sports/teams/${encodeURIComponent(team.id)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberUid: cleanUid }),
      });
      setMemberUid('');
      onFeedback('成员已添加');
      await loadMembers();
    } catch (error) {
      onFeedback(`成员添加失败：${errorMessage(error)}`, true);
    } finally {
      setBusyUid(null);
    }
  }

  async function mutateMember(member: SportsTeamMemberRecord, kind: 'grant' | 'revoke' | 'remove') {
    setBusyUid(member.memberUid);
    try {
      const encodedTeam = encodeURIComponent(team.id);
      const encodedMember = encodeURIComponent(member.memberUid);
      if (kind === 'grant') {
        await client.request(`/sports/teams/${encodedTeam}/captains`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberUid: member.memberUid }),
        });
      } else if (kind === 'revoke') {
        await client.request(`/sports/teams/${encodedTeam}/captains/${encodedMember}`, {
          method: 'DELETE',
        });
      } else {
        await client.request<void>(`/sports/teams/${encodedTeam}/members/${encodedMember}`, {
          method: 'DELETE',
        });
      }
      onFeedback(
        kind === 'grant' ? '队长权限已授予' : kind === 'revoke' ? '队长权限已撤销' : '成员已移除',
      );
      await loadMembers();
    } catch (error) {
      onFeedback(`成员操作失败：${errorMessage(error)}`, true);
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <section aria-label={`${team.name}成员管理`}>
      <h4>成员与队长</h4>
      {canManage ? (
        <form onSubmit={(event) => void addMember(event)}>
          <label>
            添加成员 UID
            <input
              required
              maxLength={128}
              value={memberUid}
              onChange={(event) => setMemberUid(event.currentTarget.value)}
            />
          </label>
          <button type="submit" disabled={busyUid !== null}>
            添加成员
          </button>
        </form>
      ) : null}
      {canManage ? (
        <RosterImport
          client={client}
          onFeedback={onFeedback}
          onImported={loadMembers}
          team={team}
        />
      ) : null}
      {members === null && loadError === null && <p role="status">正在加载成员…</p>}
      {loadError !== null && <p role="alert">成员加载失败：{loadError}</p>}
      {members?.length === 0 && <p>暂无成员</p>}
      {members !== null && members.length > 0 ? (
        <ul aria-label={`${team.name}成员列表`}>
          {members.map((member) => (
            <li key={member.id}>
              <span>
                {member.memberUid}
                {member.isCaptain ? '（队长）' : ''}
              </span>
              {canManage ? (
                member.isCaptain ? (
                  <button
                    type="button"
                    disabled={busyUid !== null}
                    onClick={() => void mutateMember(member, 'revoke')}
                  >
                    撤销队长
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyUid !== null}
                      onClick={() => void mutateMember(member, 'grant')}
                    >
                      授予队长
                    </button>
                    <button
                      type="button"
                      disabled={busyUid !== null}
                      onClick={() => void mutateMember(member, 'remove')}
                    >
                      移除成员
                    </button>
                  </>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function SportsPage({ client, user: suppliedUser }: SportsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as SportsUser | null) ?? null) : suppliedUser;
  const [teams, setTeams] = useState<SportsTeamRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');

  const loadTeams = useCallback(async () => {
    setLoadError(null);
    try {
      setTeams(await activeClient.request<SportsTeamRecord[]>('/sports/teams'));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [activeClient]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  function showFeedback(message: string, error = false) {
    if (error) {
      setFeedback(null);
      setActionError(message);
    } else {
      setActionError(null);
      setFeedback(message);
    }
  }

  function replaceConfirmed(team: SportsTeamRecord) {
    setTeams((current) => {
      if (current === null) return [team];
      return current.some((item) => item.id === team.id)
        ? current.map((item) => (item.id === team.id ? team : item))
        : [...current, team];
    });
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim();
    const description = createDescription.trim();
    if (!name || !description) {
      showFeedback('队伍名称和介绍不能为空', true);
      return;
    }
    setBusyTeamId('new');
    try {
      const created = await activeClient.request<SportsTeamRecord>('/sports/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status: 'draft' }),
      });
      replaceConfirmed(created);
      setCreateName('');
      setCreateDescription('');
      showFeedback('队伍草稿已创建');
    } catch (error) {
      showFeedback(`队伍创建失败：${errorMessage(error)}`, true);
    } finally {
      setBusyTeamId(null);
    }
  }

  function beginEdit(team: SportsTeamRecord) {
    setEditingId(team.id);
    setEditName(team.name);
    setEditDescription(team.description);
    setActionError(null);
  }

  async function saveTeam(team: SportsTeamRecord, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = editName.trim();
    const description = editDescription.trim();
    if (!name || !description) {
      showFeedback('队伍名称和介绍不能为空', true);
      return;
    }
    setBusyTeamId(team.id);
    try {
      const updated = await activeClient.request<SportsTeamRecord>('/sports/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: team.id, name, description }),
      });
      replaceConfirmed(updated);
      setEditingId(null);
      showFeedback('队伍信息已更新');
    } catch (error) {
      showFeedback(`保存失败，已保留服务器确认状态：${errorMessage(error)}`, true);
    } finally {
      setBusyTeamId(null);
    }
  }

  async function transitionTeam(team: SportsTeamRecord, to: SportsTeamStatus) {
    setBusyTeamId(team.id);
    try {
      const updated = await activeClient.request<SportsTeamRecord>(
        `/sports/teams/${encodeURIComponent(team.id)}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to }),
        },
      );
      replaceConfirmed(updated);
      showFeedback(
        to === 'archived' ? '队伍已归档' : to === 'active' ? '队伍已启用' : '队伍状态已更新',
      );
    } catch (error) {
      showFeedback(`状态更新失败，已保留服务器确认状态：${errorMessage(error)}`, true);
    } finally {
      setBusyTeamId(null);
    }
  }

  const canCreate = permitted(user, 'sports.team.create', 'sports_team');

  return (
    <section className="module-page" aria-labelledby="sports-title">
      <h2 id="sports-title">体育代表队</h2>
      <p>维护代表队、成员、队长和签到；所有管理动作均按具体队伍范围校验。</p>

      {feedback !== null && <p role="status">{feedback}</p>}
      {actionError !== null && <p role="alert">{actionError}</p>}
      {teams === null && loadError === null && <p role="status">正在加载代表队…</p>}
      {loadError !== null && <p role="alert">代表队加载失败：{loadError}</p>}
      {teams?.length === 0 && <p>暂无体育代表队</p>}

      {teams !== null && teams.length > 0 && (
        <div className="workbench-grid">
          {teams.map((team) => {
            const headingId = `sports-${team.id}-title`;
            const mayUpdate = permitted(user, 'sports.team.update', 'sports_team', team.scope);
            const mayReadCheckins = permitted(
              user,
              'sports.checkin.read',
              'sports_checkin',
              team.scope,
            );
            const mayCreateCheckins =
              team.status === 'active' &&
              permitted(user, 'sports.checkin.create', 'sports_checkin', team.scope);
            const busy = busyTeamId === team.id;
            return (
              <article className="workbench-card" aria-labelledby={headingId} key={team.id}>
                <span
                  className="status-badge"
                  data-status={team.status === 'active' ? 'success' : 'warning'}
                >
                  {statusLabels[team.status]}
                </span>
                <h3 id={headingId}>{team.name}</h3>
                <p>{team.description}</p>
                <p>
                  范围：<code>{`${team.scope.type}/${team.scope.id}`}</code>
                </p>

                {mayUpdate && editingId === team.id ? (
                  <form onSubmit={(event) => void saveTeam(team, event)}>
                    <label>
                      编辑队伍名称
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </label>
                    <label>
                      编辑队伍介绍
                      <textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busy}>
                      保存队伍
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={busy}>
                      取消编辑
                    </button>
                  </form>
                ) : mayUpdate ? (
                  <div className="action-row">
                    <button type="button" onClick={() => beginEdit(team)} disabled={busy}>
                      编辑队伍
                    </button>
                    {team.status === 'draft' ? (
                      <button
                        type="button"
                        onClick={() => void transitionTeam(team, 'active')}
                        disabled={busy}
                      >
                        启用队伍
                      </button>
                    ) : team.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void transitionTeam(team, 'archived')}
                        disabled={busy}
                      >
                        归档队伍
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void transitionTeam(team, 'active')}
                        disabled={busy}
                      >
                        恢复队伍
                      </button>
                    )}
                  </div>
                ) : null}

                {mayUpdate ? (
                  <TeamMemberManagement
                    canManage={team.status !== 'archived'}
                    client={activeClient}
                    onFeedback={showFeedback}
                    team={team}
                  />
                ) : null}
                {mayReadCheckins ? (
                  <TeamCheckinForm
                    canCreate={mayCreateCheckins}
                    client={activeClient}
                    onFeedback={showFeedback}
                    team={team}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {canCreate ? (
        <section aria-labelledby="sports-create-title">
          <h2 id="sports-create-title">创建代表队</h2>
          <form onSubmit={createTeam}>
            <label>
              队伍名称
              <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
            </label>
            <label>
              队伍介绍
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busyTeamId === 'new'}>
              创建队伍草稿
            </button>
          </form>
        </section>
      ) : null}
    </section>
  );
}
