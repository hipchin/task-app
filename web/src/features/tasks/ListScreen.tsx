import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addMonths,
  dayOfWeek,
  eachDay,
  formatDayLabel,
  formatPeriod,
  periodFrom,
  todayJst,
  type DateStr,
} from '../../lib/date'
import { expandRoutines } from '../../lib/expandRoutines'
import { useOnline } from '../../lib/online'
import { errorMessage } from '../../lib/errors'
import type { Routine, RoutineLogWithAttachments, TaskWithAttachments } from '../../lib/types'
import { useAddTask, useTasks, useToggleTask } from './api'
import { useRoutineLogs, useRoutines, useToggleRoutine } from '../routines/api'
import { useToast } from '../../components/toastContext'
import { Link } from '../../components/Link'
import {
  IconCheck,
  IconChevronRight,
  IconClip,
  IconNextPeriod,
  IconPlus,
  IconPrevPeriod,
  IconRepeat,
} from '../../components/Icons'

const START_KEY = 'task-app:list-start'
const SHOW_ALL_KEY = 'task-app:show-all'

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // 保存できなくても動作に影響しない
  }
}
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 保存できなくても動作に影響しない
  }
}

type Row =
  | { kind: 'routine'; key: string; routine: Routine; log: RoutineLogWithAttachments | null; done: boolean }
  | { kind: 'task'; key: string; task: TaskWithAttachments }

export function ListScreen() {
  const today = todayJst()
  const [start, setStart] = useState<DateStr>(() => readSession(START_KEY) ?? today)
  // TODO-1: 「すべて」ボタンの意味は未決。仮に「すべて表示 ⇔ 未完了のみ」の切り替えとする
  const [showAll, setShowAll] = useState<boolean>(() => readLocal(SHOW_ALL_KEY) !== 'false')
  const { from, to } = periodFrom(start)
  const online = useOnline()
  const toast = useToast()

  useEffect(() => writeSession(START_KEY, start), [start])
  useEffect(() => writeLocal(SHOW_ALL_KEY, String(showAll)), [showAll])

  const tasksQ = useTasks(from, to)
  const routinesQ = useRoutines()
  const logsQ = useRoutineLogs(from, to)

  const byDay = useMemo(() => {
    const map = new Map<DateStr, Row[]>()
    const push = (d: DateStr, r: Row) => {
      const list = map.get(d)
      if (list) list.push(r)
      else map.set(d, [r])
    }
    // ルーティーン → 通常タスクの順（SPEC §1.1）
    for (const o of expandRoutines(routinesQ.data ?? [], logsQ.data ?? [], from, to)) {
      push(o.date, { kind: 'routine', key: `r:${o.routine.id}:${o.date}`, routine: o.routine, log: o.log, done: o.done })
    }
    for (const t of tasksQ.data ?? []) push(t.date, { kind: 'task', key: `t:${t.id}`, task: t })
    return map
  }, [routinesQ.data, logsQ.data, tasksQ.data, from, to])

  const loading = (tasksQ.isPending || routinesQ.isPending || logsQ.isPending) && !tasksQ.data
  const error = tasksQ.error ?? routinesQ.error ?? logsQ.error
  const listRef = useRef<HTMLDivElement>(null)

  const moveTo = (s: DateStr) => {
    setStart(s)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="screen">
      <header className="list-header">
        <div className="list-header-top">
          <div className="period-nav" role="group" aria-label="期間の移動">
            <button type="button" className="period-btn" onClick={() => moveTo(addMonths(start, -1))} aria-label="前の期間">
              <IconPrevPeriod className="icon icon-sm" />
            </button>
            <button type="button" className="period-btn period-today" onClick={() => moveTo(today)}>
              今日
            </button>
            <button type="button" className="period-btn" onClick={() => moveTo(addMonths(start, 1))} aria-label="次の期間">
              <IconNextPeriod className="icon icon-sm" />
            </button>
          </div>
          <h1 className="list-title">やること</h1>
          <button
            type="button"
            className="btn btn-secondary btn-compact filter-toggle"
            aria-pressed={!showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'すべて' : '未完了'}
          </button>
        </div>
      </header>
      <p className="period-label">
        <span className="visually-hidden">期間: </span>
        {formatPeriod(from, to)}
      </p>

      {error && !tasksQ.data ? (
        <div className="inline-error" role="alert">
          <p>{errorMessage(error, '一覧を読み込め')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void tasksQ.refetch()}>
            再読み込み
          </button>
        </div>
      ) : null}

      {loading ? <DelayedLoading /> : null}

      <div className="day-list" ref={listRef} aria-busy={loading}>
        {loading
          ? null
          : eachDay(from, to).map((d) => (
              <DaySection
                key={d}
                date={d}
                isToday={d === today}
                rows={(byDay.get(d) ?? []).filter((r) => showAll || !(r.kind === 'task' ? r.task.done : r.done))}
                online={online}
                onError={(e, action) => toast.show(errorMessage(e, action))}
              />
            ))}
      </div>
    </div>
  )
}

function DelayedLoading() {
  // 300ms 以内に終わる読み込みでは表示しない（PF-MOT-05）
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300)
    return () => clearTimeout(t)
  }, [])
  return show ? (
    <p className="loading-text" role="status">
      読み込み中…
    </p>
  ) : null
}

function DaySection({
  date,
  isToday,
  rows,
  online,
  onError,
}: {
  date: DateStr
  isToday: boolean
  rows: Row[]
  online: boolean
  onError: (e: unknown, action: string) => void
}) {
  const dow = dayOfWeek(date)
  const dayClass = dow === 6 ? 'day-sat' : dow === 0 ? 'day-sun' : ''
  const toggleTask = useToggleTask()
  const toggleRoutine = useToggleRoutine()
  const headingId = `day-${date}`

  return (
    <section className={`day${isToday ? ' day-today' : ''}`} aria-labelledby={headingId} data-date={date}>
      <h2 id={headingId} className={`day-heading ${dayClass}`}>
        {formatDayLabel(date)}
        {isToday ? <span className="today-badge">今日</span> : null}
      </h2>
      <ul className="rows">
        {rows.map((r) =>
          r.kind === 'task' ? (
            <TaskRow
              key={r.key}
              title={r.task.title}
              done={r.task.done}
              repeat={false}
              clip={r.task.attachments.length > 0}
              disabled={!online}
              detail={{ name: 'task', id: r.task.id }}
              onToggle={() =>
                toggleTask.mutate(
                  { id: r.task.id, done: !r.task.done },
                  { onError: (e) => onError(e, '完了状態を変更') },
                )
              }
            />
          ) : (
            <TaskRow
              key={r.key}
              title={r.routine.title}
              done={r.done}
              repeat
              clip={(r.log?.attachments.length ?? 0) > 0}
              disabled={!online}
              detail={{ name: 'routineDay', routineId: r.routine.id, date }}
              onToggle={() =>
                toggleRoutine.mutate(
                  { routineId: r.routine.id, date, done: !r.done },
                  { onError: (e) => onError(e, '完了状態を変更') },
                )
              }
            />
          ),
        )}
      </ul>
      <div className="quick-add">
        <QuickAdd date={date} label={formatDayLabel(date)} disabled={!online} onError={onError} />
      </div>
    </section>
  )
}

function TaskRow({
  title,
  done,
  repeat,
  clip,
  disabled,
  detail,
  onToggle,
}: {
  title: string
  done: boolean
  repeat: boolean
  clip: boolean
  disabled: boolean
  detail: Parameters<typeof Link>[0]['to']
  onToggle: () => void
}) {
  return (
    <li className={`row${done ? ' row-done' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${title} を${done ? '未完了に戻す' : '完了にする'}`}
        className="check"
        onClick={onToggle}
        disabled={disabled}
      >
        <span className="check-box">{done ? <IconCheck className="icon icon-check" /> : null}</span>
      </button>
      <Link to={detail} className="row-main">
        <span className="row-title">{title}</span>
        {repeat ? <IconRepeat className="icon icon-sm row-icon" title="ルーティーン" /> : null}
        {clip ? <IconClip className="icon icon-sm row-icon" title="画像あり" /> : null}
      </Link>
      <Link to={detail} className="icon-btn row-detail" aria-label={`${title} の詳細`}>
        <IconChevronRight />
      </Link>
    </li>
  )
}

function QuickAdd({
  date,
  label,
  disabled,
  onError,
}: {
  date: DateStr
  label: string
  disabled: boolean
  onError: (e: unknown, action: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addTask = useAddTask()

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const submit = () => {
    const title = text.trim()
    if (!title) return false
    setText('')
    addTask.mutate(
      { id: crypto.randomUUID(), title, date, sort_order: Date.now() },
      {
        onError: (e) => {
          onError(e, `「${title}」を追加`)
        },
      },
    )
    return true
  }

  // オフラインになったら入力欄を閉じる
  if (!open || disabled) {
    return (
      <button
        type="button"
        className="quick-add-btn"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`${label} にタスクを追加`}
      >
        <IconPlus className="icon icon-sm" />
        <span>追加</span>
      </button>
    )
  }

  return (
    <form
      className="quick-add-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
        // 続けて入力できるよう開いたままにする
        inputRef.current?.focus()
      }}
    >
      <label className="visually-hidden" htmlFor={`qa-${date}`}>
        {label} に追加するタスク
      </label>
      <input
        id={`qa-${date}`}
        ref={inputRef}
        className="quick-add-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        enterKeyHint="done"
        autoComplete="off"
        placeholder="タスクを入力して Enter"
        onKeyDown={(e) => {
          // 日本語入力の変換確定の Enter では追加しない（Safari は keyCode 229 で判定する）
          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
            e.preventDefault()
            return
          }
          if (e.key === 'Escape') {
            setText('')
            setOpen(false)
          }
        }}
        onBlur={() => {
          // キーボードの「完了」などでフォーカスが外れたら、入力済みなら追加して閉じる
          submit()
          setOpen(false)
        }}
      />
    </form>
  )
}
