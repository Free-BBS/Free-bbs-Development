import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { ApiError, createApiClient, type ApiClient } from '../../core/api/client.js';

type ProposalStatus =
  'submitted' | 'reviewing' | 'researching' | 'advancing' | 'resolved' | 'closed';

interface Proposal {
  id: string;
  title: string;
  problemDescription: string;
  proposedSolution: string;
  category: string;
  publicProgress: string;
  status: ProposalStatus;
  internalNote?: string;
}

type ProposalUser = UserContext & {
  policies?: readonly { action: string; effect?: 'allow' | 'deny'; scope?: ScopeRef }[];
};

export interface ProposalDetailPageProps {
  client?: Pick<ApiClient, 'request'>;
  proposalId: string;
  user?: ProposalUser | null;
}

const statuses: readonly ProposalStatus[] = [
  'submitted',
  'reviewing',
  'researching',
  'advancing',
  'resolved',
  'closed',
];

const statusLabels: Record<ProposalStatus, string> = {
  submitted: '已提交',
  reviewing: '审核中',
  researching: '调研中',
  advancing: '推进中',
  resolved: '已解决',
  closed: '已关闭',
};

function matches(pattern: string, permission: string): boolean {
  return (
    pattern === '*' ||
    pattern === permission ||
    (pattern.endsWith('.*') && permission.startsWith(pattern.slice(0, -1)))
  );
}

function canMaintain(user: ProposalUser | null | undefined): boolean {
  if (user?.roles.includes('platform.super_admin')) return true;
  const policies = (user?.policies ?? []).filter((policy) =>
    matches(policy.action, 'information.proposal.manage'),
  );
  return (
    !policies.some((policy) => policy.effect === 'deny') &&
    policies.some((policy) => policy.effect !== 'deny')
  );
}

function isProposal(value: unknown): value is Proposal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Proposal>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.problemDescription === 'string' &&
    typeof candidate.proposedSolution === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.publicProgress === 'string' &&
    statuses.includes(candidate.status as ProposalStatus)
  );
}

export function ProposalDetailPage({ client, proposalId, user }: ProposalDetailPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const api = client ?? defaultClient;
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProposal = useCallback(async () => {
    setError(null);
    setProposal(null);
    try {
      const loaded = await api.request<unknown>(
        `/information/proposals/${encodeURIComponent(proposalId)}`,
      );
      if (!isProposal(loaded)) throw new Error('Invalid proposal response');
      setProposal(loaded);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提案详情加载失败，请稍后重试');
    }
  }, [api, proposalId]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  if (error !== null) return <p role="alert">{error}</p>;
  if (proposal === null) return <p role="status">正在加载提案详情…</p>;

  return (
    <section aria-labelledby="proposal-detail-title">
      <Link to="/information/proposals">← 返回提案池</Link>
      <header className="page-section-header">
        <div>
          <span>{proposal.category}</span>
          <h2 id="proposal-detail-title">{proposal.title}</h2>
          <p>{statusLabels[proposal.status]}</p>
        </div>
      </header>
      <h3>问题描述</h3>
      <p>{proposal.problemDescription}</p>
      <h3>建议方案</h3>
      <p>{proposal.proposedSolution}</p>
      <h3>公开进展</h3>
      <p>{proposal.publicProgress}</p>
      {canMaintain(user) && proposal.internalNote ? (
        <section aria-labelledby="proposal-internal-note-title">
          <h3 id="proposal-internal-note-title">内部备注</h3>
          <p>{proposal.internalNote}</p>
        </section>
      ) : null}
    </section>
  );
}
