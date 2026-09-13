import { Link } from 'react-router-dom';

export interface ProblemDetailPageProps {
  problemId: string;
}

export function ProblemDetailPage({ problemId }: ProblemDetailPageProps) {
  return (
    <section className="module-page" aria-labelledby="liaison-problem-detail-title">
      <Link to="/liaison">← 返回联络资源</Link>
      <header className="page-section-header">
        <div>
          <p className="eyebrow">问题社区</p>
          <h2 id="liaison-problem-detail-title">问题 {problemId}</h2>
          <p>该页面为围绕问题开展协作保留稳定入口，不将联络资源误作联系人目录。</p>
        </div>
      </header>
    </section>
  );
}
