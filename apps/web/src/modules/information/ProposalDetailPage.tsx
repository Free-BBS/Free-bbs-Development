import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { EditorDrawer } from '../../components/EditorDrawer.js';
import { ApiError, createApiClient, type ApiClient } from '../../core/api/client.js';

type ProposalStatus =
  'submitted' | 'reviewing' | 'researching' | 'advancing' | 'resolved' | 'closed';

interface PublicProposal {
  id: string;
  title: string;
  problemDescription: string;
  proposedSolution: string;
  category: string;
  submitterUid: string;
  assigneeUid: string | null;
  dueAt: string | null;
  publicProgress: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

interface MaintenanceProposal extends PublicProposal {
  internalNote: string;
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

function isPublicProposal(value: unknown): value is PublicProposal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PublicProposal>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.problemDescription === 'string' &&
    typeof candidate.proposedSolution === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.publicProgress === 'string' &&
    (candidate.dueAt === null || typeof candidate.dueAt === 'string') &&
    statuses.includes(candidate.status as ProposalStatus)
  );
}

function isMaintenanceProposal(value: unknown): value is MaintenanceProposal {
  if (!isPublicProposal(value) || !('internalNote' in value)) return false;
  return typeof value.internalNote === 'string';
}

function dateTimeValue(value: string | null): string {
  return value === null ? '' : value.slice(0, 16);
}

function dueDate(value: string | null): string {
  return value === null ? '尚未设定' : value.slice(0, 10);
}

export function ProposalDetailPage({ client, proposalId, user }: ProposalDetailPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const api = client ?? defaultClient;
  const maintenance = canMaintain(user);
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [status, setStatus] = useState<ProposalStatus>('submitted');
  const [assigneeUid, setAssigneeUid] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [publicProgress, setPublicProgress] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadProposal = useCallback(async () => {
    setError(null);
    setProposal(null);
    try {
      const loaded = await api.request<unknown>(
        `/information/proposals/${encodeURIComponent(proposalId)}`,
      );
      if (!isPublicProposal(loaded)) throw new Error('Invalid proposal response');
      setProposal(loaded);
      setStatus(loaded.status);
      setAssigneeUid(loaded.assigneeUid ?? '');
      setDueAt(dateTimeValue(loaded.dueAt));
      setPublicProgress(loaded.publicProgress);
      setCategory(loaded.category);
      setInternalNote(isMaintenanceProposal(loaded) ? loaded.internalNote : '');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提案详情加载失败，请稍后重试');
    }
  }, [api, proposalId]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  async function saveMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (proposal === null || !maintenance) return;
    setPending(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await api.request<unknown>(`/information/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category.trim(),
          status,
          assigneeUid: assigneeUid.trim() || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          publicProgress: publicProgress.trim(),
          internalNote: internalNote.trim(),
        }),
      });
      if (!isPublicProposal(updated)) throw new Error('Invalid proposal response');
      setProposal(updated);
      setInternalNote(isMaintenanceProposal(updated) ? updated.internalNote : '');
      setFeedback('提案维护信息已保存');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提案维护信息保存失败，请稍后重试');
    } finally {
      setPending(false);
    }
  }

  if (error !== null && proposal === null) return <p role="alert">{error}</p>;
  if (proposal === null) return <p role="status">正在加载提案详情…</p>;

  return (
    <section aria-labelledby="proposal-detail-title">
      <Link to="/information/proposals">← 返回提案池</Link>
      <div className="proposal-detail-layout">
        <article>
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
          <section aria-labelledby="proposal-timeline-title">
            <h3 id="proposal-timeline-title">提案进展</h3>
            <ol aria-label="提案进展时间线">
              <li>当前状态：{statusLabels[proposal.status]}</li>
              <li>公开进展：{proposal.publicProgress}</li>
              <li>负责人：{proposal.assigneeUid ?? '尚未分派'}</li>
              <li>计划完成：{dueDate(proposal.dueAt)}</li>
            </ol>
          </section>
          {maintenance ? (
            <button type="button" onClick={() => setDrawerOpen(true)}>
              维护提案
            </button>
          ) : null}
        </article>
        {maintenance ? (
          <EditorDrawer
            open={drawerOpen}
            title="维护提案"
            description="仅权益发展中心维护人员可见的后台字段。"
            onClose={() => setDrawerOpen(false)}
          >
            <form onSubmit={saveMaintenance}>
              <label>
                提案类别
                <input
                  value={category}
                  maxLength={80}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </label>
              <label>
                提案状态
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ProposalStatus)}
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                负责人 UID
                <input
                  value={assigneeUid}
                  maxLength={128}
                  onChange={(event) => setAssigneeUid(event.target.value)}
                />
              </label>
              <label>
                完成期限
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
              <label>
                公开进展
                <textarea
                  value={publicProgress}
                  maxLength={20000}
                  onChange={(event) => setPublicProgress(event.target.value)}
                />
              </label>
              <label>
                内部备注
                <textarea
                  value={internalNote}
                  maxLength={20000}
                  onChange={(event) => setInternalNote(event.target.value)}
                />
              </label>
              <button type="submit" disabled={pending}>
                保存提案维护信息
              </button>
            </form>
          </EditorDrawer>
        ) : null}
      </div>
      {feedback ? <p role="status">{feedback}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
