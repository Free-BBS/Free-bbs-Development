import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { ScopeRef, UserContext } from '@freebbs-development/contracts';
import { ApiError, type ApiClient } from '../../core/api/client.js';

type ProposalStatus =
  'submitted' | 'reviewing' | 'researching' | 'advancing' | 'resolved' | 'closed';

type ProposalUser = UserContext & {
  policies?: readonly { action: string; effect?: 'allow' | 'deny'; scope?: ScopeRef }[];
};

interface Proposal {
  id: string;
  title: string;
  problemDescription: string;
  proposedSolution: string;
  category: string;
  submitterUid: string;
  assigneeUid: string | null;
  publicProgress: string;
  internalNote?: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

interface ProposalPoolProps {
  client: Pick<ApiClient, 'request'>;
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
    typeof candidate.publicProgress === 'string' &&
    statuses.includes(candidate.status as ProposalStatus)
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function ProposalPool({ client, user }: ProposalPoolProps) {
  const maintenance = canMaintain(user);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [proposedSolution, setProposedSolution] = useState('');
  const [category, setCategory] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<ProposalStatus>('submitted');
  const [editAssigneeUid, setEditAssigneeUid] = useState('');
  const [editPublicProgress, setEditPublicProgress] = useState('');
  const [editInternalNote, setEditInternalNote] = useState('');

  const loadProposals = useCallback(async () => {
    try {
      const loaded = await client.request<unknown[]>('/information/proposals');
      setProposals(loaded.filter(isProposal));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  async function openProposal(id: string) {
    setError(null);
    try {
      const detail = await client.request<unknown>(`/information/proposals/${id}`);
      if (!isProposal(detail)) throw new Error('Invalid proposal response');
      setSelected(detail);
      setEditCategory(detail.category);
      setEditStatus(detail.status);
      setEditAssigneeUid(detail.assigneeUid ?? '');
      setEditPublicProgress(detail.publicProgress);
      setEditInternalNote(detail.internalNote ?? '');
    } catch (caught) {
      setError(errorMessage(caught, '提案详情加载失败，请稍后重试'));
    }
  }

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      title: title.trim(),
      problemDescription: problemDescription.trim(),
      proposedSolution: proposedSolution.trim(),
      category: category.trim(),
    };
    if (Object.values(input).some((value) => !value)) {
      setError('请完整填写提案标题、问题描述、建议方案和类别');
      return;
    }
    setPending(true);
    setError(null);
    setFeedback(null);
    try {
      await client.request<Proposal>('/information/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      setTitle('');
      setProblemDescription('');
      setProposedSolution('');
      setCategory('');
      setFeedback('提案已提交');
      await loadProposals();
    } catch (caught) {
      setError(errorMessage(caught, '提案提交失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }

  async function saveMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null) return;
    setPending(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await client.request<Proposal>(`/information/proposals/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: editCategory.trim(),
          status: editStatus,
          assigneeUid: editAssigneeUid.trim() || null,
          publicProgress: editPublicProgress.trim(),
          internalNote: editInternalNote.trim(),
        }),
      });
      setSelected(updated);
      setFeedback('提案维护信息已保存');
      await loadProposals();
    } catch (caught) {
      setError(errorMessage(caught, '提案维护信息保存失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="proposal-pool-heading">
      <header className="page-section-header">
        <div>
          <h2 id="proposal-pool-heading">公开提案池</h2>
          <p>公开查看问题、建议方案和推进进展；权益发展中心负责后台维护。</p>
        </div>
      </header>

      {loading ? <p role="status">正在加载提案池…</p> : null}
      {!loading && unavailable ? <p>提案池暂时无法加载。</p> : null}
      {!loading && !unavailable ? (
        <div className="table-scroll">
          <table aria-label="公开提案池">
            <thead>
              <tr>
                <th>提案</th>
                <th>类别</th>
                <th>状态</th>
                <th>公开进展</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {proposals.length === 0 ? (
                <tr>
                  <td colSpan={5}>当前还没有公开提案。</td>
                </tr>
              ) : (
                proposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td>{proposal.title}</td>
                    <td>{proposal.category}</td>
                    <td>{statusLabels[proposal.status]}</td>
                    <td>{proposal.publicProgress}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`查看 ${proposal.title}`}
                        onClick={() => void openProposal(proposal.id)}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <article className="proposal-detail">
          <header>
            <div>
              <span>{selected.category}</span>
              <h3>{selected.title}</h3>
            </div>
            <span
              className="status-badge"
              data-status={selected.status === 'resolved' ? 'success' : 'warning'}
            >
              {statusLabels[selected.status]}
            </span>
          </header>
          <h4>问题描述</h4>
          <p>{selected.problemDescription}</p>
          <h4>建议方案</h4>
          <p>{selected.proposedSolution}</p>
          <h4>公开进展</h4>
          <p>{selected.publicProgress}</p>

          {maintenance ? (
            <form onSubmit={saveMaintenance}>
              <label>
                提案类别
                <input
                  value={editCategory}
                  maxLength={80}
                  onChange={(event) => setEditCategory(event.target.value)}
                />
              </label>
              <label>
                提案状态
                <select
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as ProposalStatus)}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                负责人 UID
                <input
                  value={editAssigneeUid}
                  maxLength={128}
                  onChange={(event) => setEditAssigneeUid(event.target.value)}
                />
              </label>
              <label>
                公开进展
                <textarea
                  value={editPublicProgress}
                  maxLength={20000}
                  onChange={(event) => setEditPublicProgress(event.target.value)}
                />
              </label>
              <label>
                内部备注
                <textarea
                  value={editInternalNote}
                  maxLength={20000}
                  onChange={(event) => setEditInternalNote(event.target.value)}
                />
              </label>
              <button type="submit" disabled={pending}>
                保存提案维护信息
              </button>
            </form>
          ) : null}
        </article>
      ) : null}

      <section aria-labelledby="proposal-submit-heading">
        <h3 id="proposal-submit-heading">提交提案</h3>
        <form onSubmit={submitProposal} noValidate>
          <label>
            提案标题
            <input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            问题描述
            <textarea
              value={problemDescription}
              maxLength={20000}
              onChange={(event) => setProblemDescription(event.target.value)}
            />
          </label>
          <label>
            建议方案
            <textarea
              value={proposedSolution}
              maxLength={20000}
              onChange={(event) => setProposedSolution(event.target.value)}
            />
          </label>
          <label>
            提案类别
            <input
              value={category}
              maxLength={80}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
          <button type="submit" disabled={pending}>
            提交提案
          </button>
        </form>
      </section>

      {feedback ? <p role="status">{feedback}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
