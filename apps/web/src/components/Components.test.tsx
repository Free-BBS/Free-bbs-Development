import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DialogForm } from './DialogForm.js';
import { EmptyState } from './EmptyState.js';
import { RecordList } from './RecordList.js';
import { StatusBadge } from './StatusBadge.js';

describe('RecordList', () => {
  const records = [
    { id: 'first', name: '第一条' },
    { id: 'second', name: '第二条' },
  ];

  it('renders successful records as a named list', () => {
    render(
      <RecordList
        ariaLabel="经验条目"
        items={records}
        getKey={(record) => record.id}
        renderItem={(record) => <span>{record.name}</span>}
      />,
    );

    expect(screen.getByRole('list', { name: '经验条目' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('distinguishes loading, empty and error states from successful content', () => {
    const props = {
      ariaLabel: '经验条目',
      items: records,
      getKey: (record: (typeof records)[number]) => record.id,
      renderItem: (record: (typeof records)[number]) => <span>{record.name}</span>,
    };
    const { rerender } = render(<RecordList {...props} isLoading loadingLabel="正在加载" />);

    expect(screen.getByText('正在加载')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    rerender(<RecordList {...props} items={[]} emptyTitle="暂无条目" />);
    expect(screen.getByText('暂无条目').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'empty',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<RecordList {...props} error="加载失败" />);
    expect(screen.getByRole('alert')).toHaveTextContent('加载失败');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('exposes its visual status without announcing a false success state', () => {
    render(<StatusBadge status="warning">待审核</StatusBadge>);

    const badge = screen.getByText('待审核');
    expect(badge).toHaveClass('status-badge');
    expect(badge).toHaveAttribute('data-status', 'warning');
    expect(badge).not.toHaveAttribute('role', 'status');
  });
});

describe('EmptyState', () => {
  it('uses alert semantics only for errors', () => {
    const { rerender } = render(<EmptyState title="暂无数据" description="可以稍后创建" />);

    expect(screen.getByText('暂无数据').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'empty',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<EmptyState variant="error" title="请求失败" description="请重试" />);
    expect(screen.getByRole('alert')).toHaveTextContent('请求失败');
  });
});

describe('DialogForm', () => {
  function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void | Promise<void> }) {
    const [open, setOpen] = useState(false);

    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          新建条目
        </button>
        <DialogForm
          open={open}
          title="新建经验"
          description="请填写条目信息"
          submitLabel="保存"
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
        >
          <label htmlFor="record-title">标题</label>
          <input id="record-title" />
          <label htmlFor="record-body">内容</label>
          <textarea id="record-body" />
        </DialogForm>
      </>
    );
  }

  it('renders a labelled modal and focuses its first field', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '新建条目' }));

    const dialog = screen.getByRole('dialog', { name: '新建经验' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('标题')).toHaveFocus();
  });

  it('keeps a bounded scroll body and reachable footer while open', () => {
    document.body.style.overflow = 'clip';
    const { rerender } = render(
      <DialogForm open title="新建经验" onClose={vi.fn()} onSubmit={vi.fn()}>
        <label htmlFor="bounded-title">标题</label>
        <input id="bounded-title" />
      </DialogForm>,
    );

    const dialog = screen.getByRole('dialog', { name: '新建经验' });
    const body = dialog.querySelector('.dialog-form-body');
    const actions = dialog.querySelector('.dialog-form-actions');
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
    expect(body).toContainElement(screen.getByLabelText('标题'));
    expect(actions?.parentElement).toHaveClass('dialog-form-layout');
    expect(body?.nextElementSibling).toBe(actions);

    rerender(
      <DialogForm open={false} title="新建经验" onClose={vi.fn()} onSubmit={vi.fn()}>
        <span>内容</span>
      </DialogForm>,
    );
    expect(document.body).toHaveStyle({ overflow: 'clip' });
    document.body.style.overflow = '';
  });

  it('traps forward and backward focus inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '新建条目' }));

    const firstField = screen.getByLabelText('标题');
    const submit = screen.getByRole('button', { name: '保存' });

    submit.focus();
    await user.tab();
    expect(firstField).toHaveFocus();

    firstField.focus();
    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '新建条目' });
    await user.click(trigger);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('submits once and exposes pending, error and feedback states', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <DialogForm open title="新建经验" onClose={vi.fn()} onSubmit={onSubmit}>
        <label htmlFor="title">标题</label>
        <input id="title" />
      </DialogForm>,
    );

    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).toHaveBeenCalledOnce();

    rerender(
      <DialogForm
        open
        title="新建经验"
        pending
        error="保存失败"
        feedback="草稿已保存"
        onClose={vi.fn()}
        onSubmit={onSubmit}
      >
        <label htmlFor="title">标题</label>
        <input id="title" />
      </DialogForm>,
    );

    expect(screen.getByRole('button', { name: '正在提交…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败');
    expect(screen.getByRole('status')).toHaveTextContent('草稿已保存');
  });
});
