import { useId, useState } from 'react'
import { useDeleteTask, useTask, useUpdateTask } from './api'
import { AttachmentsSection } from '../attachments/AttachmentsSection'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ScreenHeader } from '../../components/ScreenHeader'
import { isDateStr, isoToJstLocal, jstLocalToIso } from '../../lib/date'
import { errorMessage } from '../../lib/errors'
import { useOnline } from '../../lib/online'
import { goBack } from '../../lib/router'
import type { Task } from '../../lib/types'
import { AutoTextarea } from '../../components/AutoTextarea'

export function TaskDetail({ id }: { id: string }) {
  const q = useTask(id)
  if (q.isPending) {
    return (
      <div className="screen">
        <ScreenHeader title="詳細" />
        <p className="loading-text">読み込み中…</p>
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="screen">
        <ScreenHeader title="詳細" />
        <div className="inline-error" role="alert">
          <p>{q.isError ? errorMessage(q.error, 'タスクを読み込み') : 'このタスクは見つかりません。削除された可能性があります。'}</p>
        </div>
      </div>
    )
  }
  return <TaskForm key={q.data.id} task={q.data} />
}

function TaskForm({ task }: { task: Task }) {
  const online = useOnline()
  const update = useUpdateTask()
  const del = useDeleteTask()
  const [title, setTitle] = useState(task.title)
  const [date, setDate] = useState(task.date)
  const [due, setDue] = useState(task.due_date ?? '')
  const [memo, setMemo] = useState(task.memo)
  const [done, setDone] = useState(task.done)
  const [remind, setRemind] = useState(task.remind_at ? isoToJstLocal(task.remind_at) : '')
  const [errors, setErrors] = useState<{ title?: string; date?: string; due?: string; form?: string }>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ids = { title: useId(), date: useId(), due: useId(), memo: useId(), remind: useId(), done: useId() }

  const save = () => {
    const next: typeof errors = {}
    if (!title.trim()) next.title = 'タイトルを入力してください。'
    if (!isDateStr(date)) next.date = '日付を正しく入力してください。'
    if (due && !isDateStr(due)) next.due = '締め切りを正しく入力してください。'
    else if (due && isDateStr(date) && due < date) next.due = '締め切りは日付と同じ日か、それより後にしてください。'
    setErrors(next)
    if (next.title || next.date || next.due) return
    const remindIso = remind ? jstLocalToIso(remind) : null
    const remindChanged = (task.remind_at ? isoToJstLocal(task.remind_at) : '') !== remind
    update.mutate(
      {
        id: task.id,
        patch: {
          title: title.trim(),
          date,
          due_date: due || null,
          memo,
          done,
          done_at: done === task.done ? task.done_at : done ? new Date().toISOString() : null,
          remind_at: remindIso,
          // リマインダーを変えたら、もう一度通知されるようにする
          ...(remindChanged ? { notified_at: null } : {}),
        },
      },
      {
        onSuccess: () => goBack(),
        onError: (e) => setErrors({ form: errorMessage(e, '保存') }),
      },
    )
  }

  return (
    <div className="screen">
      <ScreenHeader title="詳細" />
      {!online ? <p className="field-hint form-pad">オフラインのため編集できません。</p> : null}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <fieldset disabled={!online} className="form-fields">
          <div className="field">
            <label className="field-label" htmlFor={ids.title}>
              タイトル
            </label>
            <input
              id={ids.title}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${ids.title}-err` : undefined}
            />
            {errors.title ? (
              <p id={`${ids.title}-err`} className="field-error">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="field field-inline">
            <input id={ids.done} type="checkbox" className="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            <label htmlFor={ids.done}>完了</label>
          </div>

          <div className="field">
            <label className="field-label" htmlFor={ids.date}>
              日付
            </label>
            <input
              id={ids.date}
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              aria-invalid={errors.date ? true : undefined}
            />
            {errors.date ? <p className="field-error">{errors.date}</p> : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor={ids.due}>
              締め切り（任意）
            </label>
            <div className="input-row">
              <input
                id={ids.due}
                type="date"
                className="input"
                value={due}
                min={isDateStr(date) ? date : undefined}
                onChange={(e) => setDue(e.target.value)}
                aria-invalid={errors.due ? true : undefined}
                aria-describedby={`${ids.due}-hint`}
              />
              {due ? (
                <button type="button" className="btn btn-secondary" onClick={() => setDue('')}>
                  解除
                </button>
              ) : null}
            </div>
            {errors.due ? <p className="field-error">{errors.due}</p> : null}
            <p id={`${ids.due}-hint`} className="field-hint">
              日付を過ぎても終わっていないタスクは、一覧の上の「対応中」に完了するまで表示されます。
            </p>
          </div>

          <div className="field">
            <label className="field-label" htmlFor={ids.memo}>
              メモ
            </label>
            <AutoTextarea id={ids.memo} value={memo} onChange={setMemo} maxLength={20000} />
          </div>

          <div className="field">
            <label className="field-label" htmlFor={ids.remind}>
              リマインダー
            </label>
            <div className="input-row">
              <input
                id={ids.remind}
                type="datetime-local"
                className="input"
                value={remind}
                onChange={(e) => setRemind(e.target.value)}
              />
              {remind ? (
                <button type="button" className="btn btn-secondary" onClick={() => setRemind('')}>
                  解除
                </button>
              ) : null}
            </div>
            <p className="field-hint">日本時間。通知は今後のアップデートで届くようになります。</p>
          </div>
        </fieldset>

        <AttachmentsSection owner={{ kind: 'task', id: task.id }} disabled={!online} />

        {errors.form ? (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!online || update.isPending} aria-busy={update.isPending}>
            保存
          </button>
          <button type="button" className="btn btn-danger-text" onClick={() => setConfirmDelete(true)} disabled={!online}>
            削除
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="タスクを削除しますか？"
        message={`「${task.title}」と添付画像を削除します。元に戻せません。`}
        confirmLabel="削除"
        danger
        busy={del.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          del.mutate(task.id, {
            onSuccess: () => goBack(),
            onError: (e) => {
              setConfirmDelete(false)
              setErrors({ form: errorMessage(e, '削除') })
            },
          })
        }
      />
    </div>
  )
}
