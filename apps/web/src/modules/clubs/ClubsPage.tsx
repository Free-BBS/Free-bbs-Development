import { useCallback, useEffect, useMemo, useState } from 'react';

import { createApiClient } from '../../core/api/client.js';

export interface DevelopmentApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

interface ClubRecord {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
}

export interface ClubsPageProps {
  client?: DevelopmentApi;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function ClubsPage({ client }: ClubsPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const activeClient = client ?? defaultClient;
  const [clubs, setClubs] = useState<ClubRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyClubId, setBusyClubId] = useState<string | null>(null);
  const [joinedClubIds, setJoinedClubIds] = useState<ReadonlySet<string>>(new Set());

  const loadClubs = useCallback(async () => {
    setLoadError(null);
    try {
      setClubs(await activeClient.request<ClubRecord[]>('/clubs'));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [activeClient]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  async function join(club: ClubRecord) {
    setBusyClubId(club.id);
    setFeedback(null);
    setActionError(null);
    try {
      await activeClient.request(`/clubs/${encodeURIComponent(club.id)}/memberships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      setJoinedClubIds((current) => new Set(current).add(club.id));
      setFeedback(`已加入${club.name}`);
      await loadClubs();
    } catch (error) {
      setActionError(`加入失败：${errorMessage(error)}`);
    } finally {
      setBusyClubId(null);
    }
  }

  async function leave(club: ClubRecord) {
    if (!window.confirm(`确定退出“${club.name}”吗？`)) return;
    setBusyClubId(club.id);
    setFeedback(null);
    setActionError(null);
    try {
      await activeClient.request<void>(`/clubs/${encodeURIComponent(club.id)}/memberships`, {
        method: 'DELETE',
      });
      setJoinedClubIds((current) => {
        const next = new Set(current);
        next.delete(club.id);
        return next;
      });
      setFeedback(`已退出${club.name}`);
      await loadClubs();
    } catch (error) {
      setActionError(`退出失败：${errorMessage(error)}`);
    } finally {
      setBusyClubId(null);
    }
  }

  return (
    <section className="module-page" aria-labelledby="clubs-title">
      <h2 id="clubs-title">社群与俱乐部</h2>
      <p>查看活跃社群，加入后可参与共建和活动。</p>

      {feedback !== null && <p role="status">{feedback}</p>}
      {actionError !== null && <p role="alert">{actionError}</p>}
      {clubs === null && loadError === null && <p role="status">正在加载俱乐部…</p>}
      {loadError !== null && <p role="alert">俱乐部加载失败：{loadError}</p>}
      {clubs?.length === 0 && <p>暂无可加入的俱乐部</p>}

      {clubs !== null && clubs.length > 0 && (
        <div className="workbench-grid">
          {clubs.map((club) => {
            const joined = joinedClubIds.has(club.id);
            const headingId = `club-${club.id}-title`;
            return (
              <article className="workbench-card" aria-labelledby={headingId} key={club.id}>
                <span
                  className="status-badge"
                  data-status={club.status === 'active' ? 'success' : 'warning'}
                >
                  {club.status === 'active' ? '开放中' : '暂不开放'}
                </span>
                <h3 id={headingId}>{club.name}</h3>
                <p>{club.description}</p>
                {joined ? (
                  <button
                    type="button"
                    disabled={busyClubId === club.id}
                    onClick={() => void leave(club)}
                    aria-label={`退出${club.name}`}
                  >
                    {busyClubId === club.id ? '处理中…' : '退出俱乐部'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={club.status !== 'active' || busyClubId === club.id}
                    onClick={() => void join(club)}
                    aria-label={`加入${club.name}`}
                  >
                    {busyClubId === club.id ? '处理中…' : '加入俱乐部'}
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
