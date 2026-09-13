import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { createApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export type SportsTeamStatus = 'draft' | 'active' | 'archived';
export interface SportsTeamRecord {
  id: string;
  name: string;
  description: string;
  season: string;
  trainingSchedule: string;
  status: SportsTeamStatus;
  ownerUid?: string;
  scope: ScopeRef;
}

interface SportsPolicy {
  action: string;
  resource: string;
  effect?: 'allow' | 'deny';
  scope?: ScopeRef;
  expiresAt?: string | null;
}
export type SportsUser = UserContext & { policies?: readonly SportsPolicy[] };

export interface SportsPageProps {
  client?: DevelopmentApi;
  user?: SportsUser | null;
}

export const statusLabels: Record<SportsTeamStatus, string> = {
  draft: '筹备中',
  active: '活跃',
  archived: '已归档',
};

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

export function permitted(
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
      (policy.expiresAt === undefined ||
        policy.expiresAt === null ||
        Date.parse(policy.expiresAt) > now),
  );
  return (
    !matching.some((policy) => policy.effect === 'deny') &&
    matching.some((policy) => policy.effect !== 'deny')
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '未知错误';
}

export function SportsPage({ client, user: suppliedUser }: SportsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const auth = useOptionalAuth();
  const activeClient = client ?? auth?.client ?? defaultClient;
  const user =
    suppliedUser === undefined ? ((auth?.user as SportsUser | null) ?? null) : suppliedUser;
  const [teams, setTeams] = useState<SportsTeamRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [season, setSeason] = useState('');
  const [trainingSchedule, setTrainingSchedule] = useState('');

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

  const canCreate = permitted(user, 'sports.team.create', 'sports_team');

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !description.trim()) {
      setFeedback('队伍名称和简介不能为空');
      return;
    }
    setBusy(true);
    try {
      const created = await activeClient.request<SportsTeamRecord>('/sports/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          season: season.trim(),
          trainingSchedule: trainingSchedule.trim(),
          status: 'draft',
        }),
      });
      setTeams((current) => [...(current ?? []), created]);
      setName('');
      setDescription('');
      setSeason('');
      setTrainingSchedule('');
      setFeedback('代表队草稿已创建');
    } catch (error) {
      setFeedback(`创建失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module-page" aria-labelledby="sports-title">
      <header className="page-section-header">
        <div>
          <p className="eyebrow">体育中心</p>
          <h2 id="sports-title">体育代表队</h2>
          <p>查看各代表队赛季安排与公开简介；队员、训练和签到在队伍详情中维护。</p>
        </div>
      </header>

      {feedback !== null && <p role="status">{feedback}</p>}
      {teams === null && loadError === null && <p role="status">正在加载代表队…</p>}
      {loadError !== null && <p role="alert">代表队加载失败：{loadError}</p>}
      {teams?.length === 0 && <p>暂无体育代表队</p>}

      {teams !== null && teams.length > 0 && (
        <div className="workbench-grid">
          {teams.map((team) => (
            <article
              className="workbench-card"
              aria-labelledby={`sports-${team.id}-title`}
              key={team.id}
            >
              <span
                className="status-badge"
                data-status={team.status === 'active' ? 'success' : 'warning'}
              >
                {statusLabels[team.status]}
              </span>
              <h3 id={`sports-${team.id}-title`}>{team.name}</h3>
              <p>{team.description}</p>
              <dl className="module-meta-list">
                <div>
                  <dt>赛季</dt>
                  <dd>{team.season || '待补充'}</dd>
                </div>
                <div>
                  <dt>训练或比赛安排</dt>
                  <dd>{team.trainingSchedule || '待发布'}</dd>
                </div>
              </dl>
              <Link className="text-link" to={`/sports/${encodeURIComponent(team.id)}`}>
                查看队伍详情
              </Link>
            </article>
          ))}
        </div>
      )}

      {canCreate && (
        <section className="module-surface" aria-labelledby="sports-create-title">
          <h3 id="sports-create-title">新建代表队</h3>
          <form onSubmit={(event) => void createTeam(event)}>
            <label>
              队伍名称
              <input
                required
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <label>
              公开简介
              <textarea
                required
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </label>
            <label>
              赛季
              <input value={season} onChange={(event) => setSeason(event.currentTarget.value)} />
            </label>
            <label>
              训练或比赛安排
              <textarea
                value={trainingSchedule}
                onChange={(event) => setTrainingSchedule(event.currentTarget.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? '正在创建…' : '创建队伍草稿'}
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
