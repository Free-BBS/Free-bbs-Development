import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface InformationLayoutProps {
  children: ReactNode;
  title: string;
}

export function InformationLayout({ children, title }: InformationLayoutProps) {
  return (
    <section className="module-page" aria-labelledby="information-route-title">
      <header className="page-section-header">
        <div>
          <h2 id="information-route-title">{title}</h2>
          <nav aria-label="信息与咨询分区">
            <NavLink to="/information/announcements">公开信息</NavLink>{' '}
            <NavLink to="/information/consultations">咨询</NavLink>{' '}
            <NavLink to="/information/triage">分诊</NavLink>{' '}
            <NavLink to="/information/proposals">提案池</NavLink>
          </nav>
        </div>
      </header>
      {children}
    </section>
  );
}
