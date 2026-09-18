import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { FilterBar } from '../../components/FilterBar.js';
import { ModulePageHeader } from '../../components/ModulePageHeader.js';
import { ResponsiveRecordList } from '../../components/ResponsiveRecordList.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { ApiError, createApiClient, type ApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';
import { ProblemEditorDrawer, type ProblemInput } from './ProblemEditorDrawer.js';
import {
  conciseText,
  formatLiaisonDate,
  hasLiaisonPermission,
  problemScope,
  problemStatusLabels,
  sourceTypeLabels,
  statusTone,
  type LiaisonProblem,
  type LiaisonProblemStatus,
  type LiaisonUser,
  type ProblemPage,
} from './model.js';

interface BoardProblem extends LiaisonProblem {
  teamCount: number;
}

export interface LiaisonPageProps {
  client?: Pick<ApiClient, 'request'>;
  user?: LiaisonUser | null;
}

const statusOptions: Array<{ value: '' | LiaisonProblemStatus; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'open', label: '进行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'closed', label: '已结项' },
  { value: 'pending_review', label: '待审核' },
  { value: 'draft', label: '草稿' },
  { value: 'rejected', label: '待修改' },
];

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message.trim() ? error.message : fallback;
}

export function LiaisonPage({ client, user: suppliedUser }: LiaisonPageProps) {
  const defaultClient = useMemo(createApiClient, []);
  const api = client ?? defaultClient;
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as LiaisonUser | null) ?? null) : suppliedUser;
  const [problems, setProblems] = useState<BoardProblem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | LiaisonProblemStatus>('');
  const [filters, setFilters] = useState({ query: '', status: '' as '' | LiaisonProblemStatus });
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: 20, total: 0 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const load = useCallback(
    async (successMessage?: string) => {
      const generation = ++requestGeneration.current;
      setState('loading');
      setFeedback(null);
      setActionError(null);
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filters.query) params.set('query', filters.query);
      if (filters.status) params.set('status', filters.status);
      try {
        const result = await api.request<ProblemPage>(`/liaison/problems?${params.toString()}`);
        if (generation !== requestGeneration.current) return;
        setProblems(result.items);
        setPageInfo({ page: result.page, pageSize: result.pageSize, total: result.total });
        setState('ready');
        if (successMessage) setFeedback(successMessage);
      } catch {
        if (generation === requestGeneration.current) setState('error');
      }
    },
    [api, filters, page],
  );

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load, user?.uid]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({ query: query.trim(), status });
  }

  async function createProblem(input: ProblemInput) {
    const generation = requestGeneration.current;
    setPending('create');
    setEditorError(null);
    setFeedback(null);
    try {
      await api.request<LiaisonProblem>('/liaison/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (generation !== requestGeneration.current) return;
      setEditorOpen(false);
      setPending(null);
      await load('问题草稿已保存');
    } catch (error) {
      if (generation === requestGeneration.current) {
        setEditorError(apiMessage(error, '保存失败，请稍后重试'));
      }
    } finally {
      if (generation === requestGeneration.current) setPending(null);
    }
  }

  async function review(problem: LiaisonProblem, decision: 'approve' | 'reject') {
    const generation = requestGeneration.current;
    setPending(`review:${problem.id}`);
    setFeedback(null);
    setActionError(null);
    try {
      const updated = await api.request<LiaisonProblem>(
        `/liaison/problems/${encodeURIComponent(problem.id)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, note: null }),
        },
      );
      if (generation !== requestGeneration.current) return;
      setProblems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setFeedback(decision === 'approve' ? '课题已批准发布' : '课题已驳回修改');
    } catch (error) {
      if (generation === requestGeneration.current) {
        setActionError(apiMessage(error, '审核失败，请重试'));
      }
    } finally {
      if (generation === requestGeneration.current) setPending(null);
    }
  }

  const canCreate = hasLiaisonPermission(user, 'liaison.problem.create', 'liaison_problem', [
    { type: 'public', id: '*' },
  ]);

  return (
    <section className="module-page liaison-board" aria-label="联络揭榜">
      <ModulePageHeader
        title="真实问题揭榜"
        description="发现真实课题，和伙伴一起探索、协作、分享成果。"
        actions={
          canCreate ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                setEditorError(null);
                setEditorOpen(true);
              }}
            >
              代录问题
            </button>
          ) : null
        }
      />

      <FilterBar ariaLabel="筛选揭榜问题" onSubmit={applyFilters}>
        <label>
          搜索问题
          <input
            value={query}
            placeholder="标题、来源或方向"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          状态
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | LiaisonProblemStatus)}
          >
            {statusOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-action" type="submit">
          筛选
        </button>
      </FilterBar>

      <ResponsiveRecordList
        ariaLabel="揭榜问题列表"
        records={problems}
        state={state}
        errorMessage="问题榜暂时无法加载"
        emptyTitle="暂时没有符合条件的问题"
        emptyDescription="可以调整筛选条件，稍后再来看看。"
        getKey={(problem) => problem.id}
        renderRecord={(problem) => {
          const canReview =
            problem.status === 'pending_review' &&
            hasLiaisonPermission(user, 'liaison.problem.review', 'liaison_problem', [
              problemScope(problem.id),
            ]);
          return (
            <article className="liaison-problem-card" aria-label={problem.title}>
              <header>
                <div>
                  <p className="module-page-kicker">
                    {sourceTypeLabels[problem.sourceType]} · {problem.sourceName}
                  </p>
                  <h3>{problem.title}</h3>
                </div>
                <StatusBadge status={statusTone(problem.status)}>
                  {problemStatusLabels[problem.status]}
                </StatusBadge>
              </header>
              <p>{problem.summary}</p>
              <ul className="liaison-tag-list" aria-label="领域标签">
                {problem.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
              <dl className="liaison-card-facts">
                <div>
                  <dt>截止时间</dt>
                  <dd>{formatLiaisonDate(problem.deadline)}</dd>
                </div>
                <div>
                  <dt>预期成果</dt>
                  <dd>{conciseText(problem.expectedOutcome)}</dd>
                </div>
                <div>
                  <dt>参与情况</dt>
                  <dd>{problem.teamCount} 个参与团队</dd>
                </div>
              </dl>
              <div className="liaison-card-actions">
                <Link className="secondary-action-link" to={`/liaison/problems/${problem.id}`}>
                  查看课题
                </Link>
                {canReview ? (
                  <>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void review(problem, 'approve')}
                    >
                      批准发布
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void review(problem, 'reject')}
                    >
                      驳回修改
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        }}
      />
      {pageInfo.total > pageInfo.pageSize ? (
        <nav aria-label="问题榜分页" className="pagination-controls">
          <button
            type="button"
            className="secondary-action"
            disabled={pageInfo.page <= 1 || state === 'loading'}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </button>
          <span>
            第 {pageInfo.page} / {Math.ceil(pageInfo.total / pageInfo.pageSize)} 页
          </span>
          <button
            type="button"
            className="secondary-action"
            disabled={
              pageInfo.page >= Math.ceil(pageInfo.total / pageInfo.pageSize) || state === 'loading'
            }
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </button>
        </nav>
      ) : null}
      {state === 'error' ? (
        <button
          type="button"
          className="secondary-action"
          onClick={() => void load('问题榜已刷新')}
        >
          重新加载问题榜
        </button>
      ) : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}

      {canCreate ? (
        <ProblemEditorDrawer
          open={editorOpen}
          pending={pending === 'create'}
          error={editorError}
          onClose={() => setEditorOpen(false)}
          onSubmit={createProblem}
        />
      ) : null}
    </section>
  );
}
