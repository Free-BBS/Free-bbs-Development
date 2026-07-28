import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ScopeRef, UserContext } from '@freebbs-development/contracts';

import { createApiClient, type ApiClient } from '../../core/api/client.js';
import { useOptionalAuth } from '../../core/auth/AuthProvider.js';

type FinanceStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';
type FinanceKind = 'budget' | 'settlement';

type FinanceUser = UserContext & {
  policies?: readonly {
    action: string;
    resource: string;
    effect: 'allow' | 'deny';
    scope?: ScopeRef;
    expiresAt?: string | null;
  }[];
};

interface FinanceRecord {
  id: string;
  title: string;
  kind: FinanceKind;
  amountCents: number;
  activityId?: string | null;
  status: FinanceStatus;
  ownerUid: string;
  scope: ScopeRef;
  createdAt: string;
  updatedAt: string;
}

interface FinanceDraft {
  title: string;
  kind: FinanceKind;
  amount: string;
  activityId: string;
  scopeType: string;
  scopeId: string;
}

const emptyDraft: FinanceDraft = {
  title: '',
  kind: 'budget',
  amount: '0.00',
  activityId: '',
  scopeType: 'public',
  scopeId: '*',
};
const statusLabels: Record<FinanceStatus, string> = {
  draft: '草稿',
  submitted: '待审批',
  approved: '已批准',
  rejected: '已驳回',
  archived: '已归档',
};

function statusOf(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '操作失败，请稍后重试';
}

function matches(pattern: string, value: string): boolean {
  return (
    pattern === '*' ||
    pattern === value ||
    (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)))
  );
}

function permitted(user: FinanceUser | null, action: string, scope: ScopeRef): boolean {
  if (user === null) return false;
  const now = Date.now();
  const policies = (user.policies ?? []).filter(
    (policy) =>
      matches(policy.action, action) &&
      matches(policy.resource, 'finance_record') &&
      (policy.scope === undefined ||
        (policy.scope.type === scope.type && policy.scope.id === scope.id)) &&
      (policy.expiresAt == null || Date.parse(policy.expiresAt) > now),
  );
  return (
    !policies.some((policy) => policy.effect === 'deny') &&
    policies.some((policy) => policy.effect === 'allow')
  );
}

function hasAnyGrant(user: FinanceUser | null, action: string): boolean {
  if (user === null) return false;
  const now = Date.now();
  return (user.policies ?? []).some(
    (policy) =>
      matches(policy.action, action) &&
      matches(policy.resource, 'finance_record') &&
      policy.effect === 'allow' &&
      (policy.expiresAt == null || Date.parse(policy.expiresAt) > now),
  );
}

function scopeFromDraft(draft: FinanceDraft): ScopeRef {
  const activityId = draft.activityId.trim();
  return activityId
    ? { type: 'activity', id: activityId }
    : { type: draft.scopeType.trim(), id: draft.scopeId.trim() };
}

function draftFromRecord(record: FinanceRecord): FinanceDraft {
  return {
    title: record.title,
    kind: record.kind,
    amount: (record.amountCents / 100).toFixed(2),
    activityId: record.activityId ?? '',
    scopeType: record.scope.type,
    scopeId: record.scope.id,
  };
}

function validateDraft(draft: FinanceDraft): { amountCents: number; scope: ScopeRef } | string {
  if (!draft.title.trim()) return '请填写记录标题';
  const amountCents = parseAmountToCents(draft.amount);
  if (amountCents === null) return '金额最多保留两位小数，并且不能为负数';
  const scope = scopeFromDraft(draft);
  if (!/^[a-z][a-z0-9_]*$/.test(scope.type) || !scope.id) return '请填写有效的记录范围';
  return { amountCents, scope };
}

export function formatAmount(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : '';
  const absolute = Math.abs(amountCents);
  return `${sign}¥${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function parseAmountToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [yuan, fraction = ''] = trimmed.split('.');
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export interface FinancePageProps {
  client?: Pick<ApiClient, 'request'>;
  user?: FinanceUser | null;
}

export function FinancePage({ client: suppliedClient, user: suppliedUser }: FinancePageProps = {}) {
  const client = useMemo(() => suppliedClient ?? createApiClient(), [suppliedClient]);
  const auth = useOptionalAuth();
  const user =
    suppliedUser === undefined ? ((auth?.user as FinanceUser | null) ?? null) : suppliedUser;
  const [records, setRecords] = useState<FinanceRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [createDraft, setCreateDraft] = useState<FinanceDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FinanceDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [policyRevision, setPolicyRevision] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const nextExpiry = Math.min(
      ...(user?.policies ?? [])
        .map((policy) => (policy.expiresAt == null ? Number.NaN : Date.parse(policy.expiresAt)))
        .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > now),
    );
    if (!Number.isFinite(nextExpiry)) return;
    const delay = Math.min(Math.max(nextExpiry - now + 1, 1), 2_147_483_647);
    const timer = window.setTimeout(() => setPolicyRevision((current) => current + 1), delay);
    return () => window.clearTimeout(timer);
  }, [policyRevision, user]);

  function replaceConfirmed(record: FinanceRecord) {
    setRecords((current) => {
      if (current === null) return [record];
      return current.some((item) => item.id === record.id)
        ? current.map((item) => (item.id === record.id ? record : item))
        : [...current, record];
    });
  }

  const loadRecords = useCallback(
    async (preserveConfirmed = false) => {
      setError(null);
      try {
        setRecords(await client.request<FinanceRecord[]>('/finance/records'));
      } catch (caught) {
        if (!preserveConfirmed) setRecords(null);
        setError(caught);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function runAction(
    record: FinanceRecord,
    success: string,
    operation: () => Promise<FinanceRecord>,
  ): Promise<boolean> {
    setBusyId(record.id);
    setFormError('');
    setFeedback('');
    try {
      const confirmed = await operation();
      replaceConfirmed(confirmed);
      await loadRecords(true);
      setFeedback(success);
      return true;
    } catch (caught) {
      setFormError(`${errorMessage(caught)}；页面保留服务端已确认状态`);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validated = validateDraft(createDraft);
    if (typeof validated === 'string') {
      setFormError(validated);
      return;
    }
    if (!permitted(user, 'finance.record.create', validated.scope)) {
      setFormError('你没有在该范围创建财务记录的权限');
      return;
    }
    setBusyId('new');
    setFormError('');
    setFeedback('');
    try {
      const confirmed = await client.request<FinanceRecord>('/finance/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createDraft.title.trim(),
          kind: createDraft.kind,
          amountCents: validated.amountCents,
          activityId: createDraft.activityId.trim() || null,
          status: 'draft',
          scope: validated.scope,
        }),
      });
      replaceConfirmed(confirmed);
      await loadRecords(true);
      setCreateDraft(emptyDraft);
      setFeedback('财务草稿已创建');
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(record: FinanceRecord) {
    setEditingId(record.id);
    setEditDraft(draftFromRecord(record));
    setFormError('');
    setFeedback('');
  }

  async function saveEdit(record: FinanceRecord, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editDraft === null) return;
    const validated = validateDraft(editDraft);
    if (typeof validated === 'string') {
      setFormError(validated);
      return;
    }
    const canMove =
      permitted(user, 'finance.record.update', record.scope) &&
      permitted(user, 'finance.record.update', validated.scope);
    const canEditOwn =
      record.ownerUid === user?.uid &&
      permitted(user, 'finance.record.create', record.scope) &&
      permitted(user, 'finance.record.create', validated.scope);
    if (!canMove && !canEditOwn) {
      setFormError('你没有修改当前范围或目标范围的权限');
      return;
    }
    const saved = await runAction(record, '财务草稿已更新', () =>
      client.request<FinanceRecord>('/finance/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          title: editDraft.title.trim(),
          kind: editDraft.kind,
          amountCents: validated.amountCents,
          activityId: editDraft.activityId.trim() || null,
          scope: validated.scope,
        }),
      }),
    );
    if (saved) {
      setEditingId(null);
      setEditDraft(null);
    }
  }

  function canMaintainRecord(record: FinanceRecord): boolean {
    return (
      permitted(user, 'finance.record.update', record.scope) ||
      (record.ownerUid === user?.uid && permitted(user, 'finance.record.create', record.scope))
    );
  }

  function canRunTransition(record: FinanceRecord, to: FinanceStatus): boolean {
    if (to === 'approved' || to === 'rejected') {
      return permitted(user, 'finance.record.approve', record.scope);
    }
    if (to === 'archived') return permitted(user, 'finance.record.update', record.scope);
    if (to === 'submitted' || to === 'draft') return canMaintainRecord(record);
    return false;
  }

  async function transition(record: FinanceRecord, to: FinanceStatus, success: string) {
    if (!canRunTransition(record, to)) {
      setFeedback('');
      setFormError('权限已失效或不适用于该记录');
      return;
    }
    await runAction(record, success, () =>
      client.request<FinanceRecord>(
        `/finance/records/${encodeURIComponent(record.id)}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to }),
        },
      ),
    );
  }

  function fields(draft: FinanceDraft, setDraft: (draft: FinanceDraft) => void, prefix: string) {
    const activityLinked = draft.activityId.trim().length > 0;
    return (
      <>
        <label>
          {prefix}记录标题
          <input
            aria-label={`${prefix}记录标题`}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          {prefix}类型
          <select
            aria-label={`${prefix}类型`}
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as FinanceKind })}
          >
            <option value="budget">预算</option>
            <option value="settlement">结算</option>
          </select>
        </label>
        <label>
          {prefix}金额（元）
          <input
            aria-label={`${prefix}金额（元）`}
            inputMode="decimal"
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
          />
        </label>
        <label>
          {prefix}关联活动 ID（可选）
          <input
            aria-label={`${prefix}关联活动 ID（可选）`}
            value={draft.activityId}
            onChange={(event) => setDraft({ ...draft, activityId: event.target.value })}
          />
        </label>
        <label>
          {prefix}范围类型
          <input
            aria-label={`${prefix}范围类型`}
            value={activityLinked ? 'activity' : draft.scopeType}
            readOnly={activityLinked}
            onChange={(event) => setDraft({ ...draft, scopeType: event.target.value })}
          />
        </label>
        <label>
          {prefix}范围标识
          <input
            aria-label={`${prefix}范围标识`}
            value={activityLinked ? draft.activityId : draft.scopeId}
            readOnly={activityLinked}
            onChange={(event) => setDraft({ ...draft, scopeId: event.target.value })}
          />
        </label>
      </>
    );
  }

  const canCreateAtCurrentScope = permitted(
    user,
    'finance.record.create',
    scopeFromDraft(createDraft),
  );

  if (error !== null && statusOf(error) === 403) {
    return (
      <section className="module-page" aria-labelledby="finance-title">
        <h2 id="finance-title">财务治理</h2>
        <div className="empty-state">
          <h3>暂无财务访问权限</h3>
          <p>财务信息只对获得明确授权的同学开放。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="module-page" aria-labelledby="finance-title">
      <header className="page-heading">
        <div>
          <p className="eyebrow">FINANCE</p>
          <h2 id="finance-title">财务治理</h2>
        </div>
        <p>金额始终以整数分存储，预算、结算和审批记录可追溯。</p>
      </header>

      {feedback ? <p role="status">{feedback}</p> : null}
      {formError ? <p role="alert">{formError}</p> : null}

      <div className="content-grid">
        <section className="panel" aria-labelledby="finance-list-title">
          <h3 id="finance-list-title">财务记录</h3>
          {records === null && error === null ? <p>正在加载财务记录…</p> : null}
          {error !== null ? <p role="alert">财务记录加载失败，请稍后重试。</p> : null}
          {records?.length === 0 ? (
            <div className="empty-state">
              <h4>暂无财务记录</h4>
              <p>创建第一条预算或结算草稿后会显示在这里。</p>
            </div>
          ) : null}
          {records && records.length > 0 ? (
            <ul className="record-list">
              {records.map((record) => {
                const canUpdate = permitted(user, 'finance.record.update', record.scope);
                const canMaintain = canMaintainRecord(record);
                const canApprove = permitted(user, 'finance.record.approve', record.scope);
                const busy = busyId === record.id;
                const editing = editingId === record.id && editDraft !== null;
                return (
                  <li key={record.id} className="record-card">
                    <article aria-labelledby={`finance-${record.id}-title`}>
                      <header>
                        <div>
                          <h4 id={`finance-${record.id}-title`}>{record.title}</h4>
                          <p>
                            {record.kind === 'budget' ? '预算' : '结算'} ·{' '}
                            {statusLabels[record.status]}
                          </p>
                        </div>
                        <strong>{formatAmount(record.amountCents)}</strong>
                      </header>
                      <p>
                        范围：{record.scope.type}/{record.scope.id}
                      </p>
                      <p>关联活动：{record.activityId ?? '无'}</p>

                      {editing ? (
                        <form onSubmit={(event) => void saveEdit(record, event)}>
                          {fields(editDraft, setEditDraft, '编辑')}
                          <button type="submit" disabled={busy}>
                            保存修改
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                          >
                            取消编辑
                          </button>
                        </form>
                      ) : record.status === 'draft' && canMaintain ? (
                        <button
                          type="button"
                          aria-label={`编辑 ${record.title}`}
                          onClick={() => beginEdit(record)}
                        >
                          编辑
                        </button>
                      ) : null}

                      <div className="action-row">
                        {record.status === 'draft' && canMaintain ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void transition(record, 'submitted', '财务记录已提交审批')
                            }
                          >
                            提交审批
                          </button>
                        ) : null}
                        {record.status === 'submitted' && canApprove ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void transition(record, 'approved', '财务记录已批准')}
                            >
                              批准
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void transition(record, 'rejected', '财务记录已驳回')}
                            >
                              驳回
                            </button>
                          </>
                        ) : null}
                        {record.status === 'rejected' && canMaintain ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void transition(record, 'draft', '财务记录已退回草稿')}
                          >
                            退回草稿
                          </button>
                        ) : null}
                        {(record.status === 'approved' || record.status === 'rejected') &&
                        canUpdate ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void transition(record, 'archived', '财务记录已归档')}
                          >
                            归档
                          </button>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        {hasAnyGrant(user, 'finance.record.create') ? (
          <section className="panel" aria-labelledby="finance-form-title">
            <h3 id="finance-form-title">创建财务草稿</h3>
            <form onSubmit={createRecord}>
              {fields(createDraft, setCreateDraft, '')}
              <button type="submit" disabled={busyId === 'new' || !canCreateAtCurrentScope}>
                {busyId === 'new' ? '正在创建…' : '保存草稿'}
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </section>
  );
}
