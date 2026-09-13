import { Link } from 'react-router-dom';

export interface SportsTeamDetailPageProps {
  teamId: string;
}

export function SportsTeamDetailPage({ teamId }: SportsTeamDetailPageProps) {
  return (
    <section className="module-page" aria-labelledby="sports-team-detail-title">
      <Link to="/sports">← 返回代表队</Link>
      <header className="page-section-header">
        <div>
          <p className="eyebrow">代表队详情</p>
          <h2 id="sports-team-detail-title">队伍 {teamId}</h2>
          <p>该链接可用于直接进入指定代表队；队伍协作内容仍由现有代表队模块提供。</p>
        </div>
      </header>
    </section>
  );
}
