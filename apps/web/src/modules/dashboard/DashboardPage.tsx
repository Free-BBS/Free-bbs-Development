import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DetailSection } from '../../components/DetailSection.js';
import { ModulePageHeader } from '../../components/ModulePageHeader.js';
import { createApiClient, type ApiClient } from '../../core/api/client.js';

export interface DashboardPageProps {
  client?: Pick<ApiClient, 'request'>;
}

interface RecentAnnouncement {
  id: string;
  status: string;
  title: string;
  updatedAt: string;
}

interface RecentActivity {
  id: string;
  startsAt: string | null;
  status: string;
  title: string;
}

interface RecentItem {
  id: string;
  kind: '公告' | '活动';
  timestamp: string | null;
  title: string;
}

type LoadState = 'loading' | 'ready' | 'error';

function sortTimestamp(item: RecentItem): number {
  if (item.timestamp === null) return 0;
  const timestamp = Date.parse(item.timestamp);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value: string | null): string {
  if (value === null) return '时间待定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待定';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export function DashboardPage({ client }: DashboardPageProps) {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const [state, setState] = useState<LoadState>('loading');
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    let active = true;
    setState('loading');

    void Promise.all([
      api.request<RecentAnnouncement[]>('/information/announcements'),
      api.request<RecentActivity[]>('/events/activities'),
    ])
      .then(([announcements, activities]) => {
        if (!active) return;
        const items: RecentItem[] = [
          ...announcements
            .filter((announcement) => announcement.status === 'published')
            .map((announcement) => ({
              id: `announcement:${announcement.id}`,
              kind: '公告' as const,
              timestamp: announcement.updatedAt,
              title: announcement.title,
            })),
          ...activities
            .filter((activity) => activity.status === 'published')
            .map((activity) => ({
              id: `activity:${activity.id}`,
              kind: '活动' as const,
              timestamp: activity.startsAt,
              title: activity.title,
            })),
        ]
          .sort((left, right) => sortTimestamp(right) - sortTimestamp(left))
          .slice(0, 4);
        setRecentItems(items);
        setState('ready');
      })
      .catch(() => {
        if (!active) return;
        setRecentItems([]);
        setState('error');
      });

    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="module-page" aria-label="发展端工作台">
      <ModulePageHeader
        title="发展端工作台"
        description="把组织经验、公共信息与协作进展放在同一个可靠入口；完整模块导航保留在侧栏。"
        kicker="OVERVIEW"
        actions={
          <Link className="primary-action-link" to="/events">
            查看近期活动
          </Link>
        }
      />

      <div className="workbench-grid">
        <DetailSection title="行动提示" description="只保留当前阶段最需要关注的协作动作。">
          <ul>
            <li>组织活动前先核对时间、地点、报名信息与筹备时间线。</li>
            <li>遇到校园问题可提交咨询；真实课题通过联络中心代录后进入审核。</li>
            <li>维护组织资料时写清负责人、适用范围和最近更新时间。</li>
          </ul>
        </DetailSection>

        <DetailSection title="最近内容" description="来自公开公告和已发布活动。">
          {state === 'loading' ? <p role="status">正在同步最近内容…</p> : null}
          {state === 'error' ? <p role="alert">最近内容暂时无法同步，请稍后刷新。</p> : null}
          {state === 'ready' && recentItems.length === 0 ? <p>暂时没有新的公开内容。</p> : null}
          {state === 'ready' && recentItems.length > 0 ? (
            <ul className="dashboard-recent-list" aria-label="最近公开内容">
              {recentItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.kind} · {formatDate(item.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </DetailSection>
      </div>
    </section>
  );
}
