import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { createApiClient } from '../../core/api/client.js';

type FinanceStatus = 'draft' | 'submitted' | 'approved' | 'settled' | 'rejected';
type FinanceKind = 'budget' | 'settlement';

interface FinanceRecord {
  id: string;
  title: string;
  kind: FinanceKind;
  amountCents: number;
  activityId?: string | null;
  status: FinanceStatus;
  ownerUid: string;
  scope: { type: string; id: string };
  createdAt: string;
  updatedAt: string;
}

function statusOf(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : null;
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

export function FinancePage() {
  const client = useMemo(createApiClient, []);
  const [records, setRecords] = useState<FinanceRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<FinanceKind>('budget');
  const [amount, setAmount] = useState('0.00');
  const [activityId, setActivityId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadRecords = useCallback(async () => {
    setError(null);
    try {
      setRecords(await client.request<FinanceRecord[]>('/finance/records'));
    } catch (caught) {
      setRecords(null);
      setError(caught);
    }
  }, [client]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseAmountToCents(amount);
    if (amountCents === null) {
      setFormError('金额最多保留两位小数，并且不能为负数');
      return;
    }
    if (title.trim().length === 0) {
      setFormError('请填写记录标题');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setFeedback('');
    const normalizedActivityId = activityId.trim() || null;
    try {
      await client.request<FinanceRecord>('/finance/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          amountCents,
          activityId: normalizedActivityId,
          status: 'submitted',
          scope:
            normalizedActivityId === null
              ? { type: 'public', id: '*' }
              : { type: 'activity', id: normalizedActivityId },
        }),
      });
      await loadRecords();
      setTitle('');
      setAmount('0.00');
      setActivityId('');
      setFeedback('财务记录已提交');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

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

      <div className="content-grid">
        <section className="panel" aria-labelledby="finance-list-title">
          <h3 id="finance-list-title">财务记录</h3>
          {records === null && error === null ? <p>正在加载财务记录…</p> : null}
          {error !== null ? <p role="alert">财务记录加载失败，请稍后重试。</p> : null}
          {records?.length === 0 ? (
            <div className="empty-state">
              <h4>暂无财务记录</h4>
              <p>提交第一条预算或结算记录后会显示在这里。</p>
            </div>
          ) : null}
          {records && records.length > 0 ? (
            <ul className="record-list">
              {records.map((record) => (
                <li key={record.id} className="record-card">
                  <div>
                    <h4>{record.title}</h4>
                    <p>
                      {record.kind === 'budget' ? '预算' : '结算'} · {record.status}
                    </p>
                  </div>
                  <strong>{formatAmount(record.amountCents)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="finance-form-title">
          <h3 id="finance-form-title">提交记录</h3>
          <form onSubmit={submit}>
            <label>
              记录标题
              <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            </label>
            <label>
              类型
              <select
                value={kind}
                onChange={(event) => setKind(event.currentTarget.value as FinanceKind)}
              >
                <option value="budget">预算</option>
                <option value="settlement">结算</option>
              </select>
            </label>
            <label>
              金额（元）
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
              />
            </label>
            <label>
              关联活动 ID（可选）
              <input
                value={activityId}
                onChange={(event) => setActivityId(event.currentTarget.value)}
              />
            </label>
            {formError ? <p role="alert">{formError}</p> : null}
            {feedback ? <p role="status">{feedback}</p> : null}
            <button type="submit" disabled={submitting}>
              {submitting ? '正在提交…' : '提交财务记录'}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
