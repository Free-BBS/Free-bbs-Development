import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { UserContext } from '@freebbs-development/contracts';
import { createApiClient } from '../../core/api/client.js';
import { useAuth } from '../../core/auth/AuthProvider.js';
import { Can } from '../../core/permissions/Can.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

interface SportsTeamRecord {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
}

interface SportsCheckinRecord {
  id: string;
  teamId: string;
  memberUid: string;
  checkinDate: string;
  status: string;
}

export interface SportsPageProps {
  client?: DevelopmentApi;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function canManageTeam(user: UserContext, teamId: string): boolean {
  if (
    user.roles.some((role) =>
      ['platform.super_admin', 'domain.sports_lead', 'department.sports_director'].includes(role),
    )
  ) {
    return true;
  }
  return user.tags.some(
    (tag) =>
      tag.key === 'sports.team_captain' &&
      tag.scope?.type === 'sports_team' &&
      tag.scope.id === teamId,
  );
}

function TeamCheckinForm({
  client,
  onFeedback,
  team,
}: {
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
    <div>
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
    </div>
  );
}

export function SportsPage({ client }: SportsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const { user } = useAuth();
  const [teams, setTeams] = useState<SportsTeamRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTeams() {
      setLoadError(null);
      try {
        const loaded = await activeClient.request<SportsTeamRecord[]>('/sports/teams');
        if (active) setTeams(loaded);
      } catch (error) {
        if (active) setLoadError(errorMessage(error));
      }
    }
    void loadTeams();
    return () => {
      active = false;
    };
  }, [activeClient]);

  function showFeedback(message: string, error = false) {
    if (error) {
      setFeedback(null);
      setActionError(message);
    } else {
      setActionError(null);
      setFeedback(message);
    }
  }

  return (
    <section className="module-page" aria-labelledby="sports-title">
      <h2 id="sports-title">体育代表队</h2>
      <p>查看代表队信息。队长只能管理权限标签绑定的队伍。</p>

      {feedback !== null && <p role="status">{feedback}</p>}
      {actionError !== null && <p role="alert">{actionError}</p>}
      {teams === null && loadError === null && <p role="status">正在加载代表队…</p>}
      {loadError !== null && <p role="alert">代表队加载失败：{loadError}</p>}
      {teams?.length === 0 && <p>暂无体育代表队</p>}

      {teams !== null && teams.length > 0 && (
        <div className="workbench-grid">
          {teams.map((team) => {
            const headingId = `sports-${team.id}-title`;
            return (
              <article className="workbench-card" aria-labelledby={headingId} key={team.id}>
                <span
                  className="status-badge"
                  data-status={team.status === 'active' ? 'success' : 'warning'}
                >
                  {team.status === 'active' ? '活跃' : '筹备中'}
                </span>
                <h3 id={headingId}>{team.name}</h3>
                <p>{team.description}</p>
                <Can user={user} predicate={(current) => canManageTeam(current, team.id)}>
                  <TeamCheckinForm client={activeClient} onFeedback={showFeedback} team={team} />
                </Can>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
