import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  dayOfWeek,
  formatDayLabel,
  isDateStr,
  parse,
  periodFrom,
  todayJst,
  type DateStr,
} from '../../lib/date'
import { expandRoutines } from '../../lib/expandRoutines'
import { useOnline } from '../../lib/online'
import { errorMessage } from '../../lib/errors'
import type { Routine, RoutineLogWithAttachments, TaskWithAttachments } from '../../lib/types'
import { useAddTask, useOpenTasks, useTasks, useToggleTask } from './api'
import { openTaskNote } from '../../lib/openTasks'
import { buildDayGroups, oldestDate, splitOpenTasks, type DayGroup } from '../../lib/listView'
import { useRoutineLogs, useRoutines, useToggleRoutine } from '../routines/api'
import { useToast } from '../../components/toastContext'
import { Link } from '../../components/Link'
import { IconCheck, IconChevronLeft, IconChevronRight, IconClip, IconPlus, IconRepeat } from '../../components/Icons'

// 上のカードに出す日（アプリを開き直したら今日に戻す）
const SELECTED_KEY = 'task-app:list-selected'
const SHOW_ALL_KEY = 'task-app:show-all'
// 初期値は閉じる（2026-11-12 から。旧キー open-collapsed は使わない）
const OPEN_EXPANDED_KEY = 'task-app:open-expanded'
const ROUTINES_EXPANDED_KEY = 'task-app:routines-expanded'

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

type RoutineItem = {
  key: string
  date: DateStr
  routine: Routine
  log: RoutineLogWithAttachments | null
  done: boolean
}

type OnError = (e: unknown, action: string) => void

export function ListScreen() {
  const today = todayJst()
  // 上のカードに出す日。ヘッダーの ‹ › で1日ずつ動かす（SPEC §1.1。2026-11-14 から）
  const [selected, setSelected] = useState<DateStr>(() => {
    const saved = readSession(SELECTED_KEY)
    return saved && isDateStr(saved) ? saved : today
  })
  // TODO-1: 「すべて」ボタンの意味は未決。仮に「すべて表示 ⇔ 未完了のみ」の切り替えとする
  const [showAll, setShowAll] = useState<boolean>(() => readLocal(SHOW_ALL_KEY) !== 'false')
  // 選んだ日と、今日から1か月先までの「これから」をまとめて読む
  const from = selected < today ? selected : today
  const upcomingEnd = periodFrom(today).to
  const to = selected > upcomingEnd ? selected : upcomingEnd
  const isToday = selected === today
  const online = useOnline()
  const toast = useToast()
  const onError: OnError = (e, action) => toast.show(errorMessage(e, action))

  useEffect(() => writeSession(SELECTED_KEY, selected), [selected])
  useEffect(() => writeLocal(SHOW_ALL_KEY, String(showAll)), [showAll])

  const tasksQ = useTasks(from, to)
  const routinesQ = useRoutines()
  const logsQ = useRoutineLogs(from, to)
  const openQ = useOpenTasks(today)

  const groups = useMemo(() => {
    const tasks = (tasksQ.data ?? []).filter((t) => showAll || !t.done)
    const routines: RoutineItem[] = expandRoutines(routinesQ.data ?? [], logsQ.data ?? [], from, to).map((o) => ({
      key: `r:${o.routine.id}:${o.date}`,
      date: o.date,
      routine: o.routine,
      log: o.log,
      done: o.done,
    }))
    return buildDayGroups(from, to, today, tasks, routines)
  }, [tasksQ.data, routinesQ.data, logsQ.data, from, to, today, showAll])

  // 締め切りが近い対応中のタスクは、今日を見ているときだけ上のカードに出す
  const { urgent, rest } = splitOpenTasks(openQ.data ?? [], today, isToday)

  const loading = (tasksQ.isPending || routinesQ.isPending || logsQ.isPending) && !tasksQ.data
  const error = tasksQ.error ?? routinesQ.error ?? logsQ.error

  const moveTo = (d: DateStr) => {
    setSelected(d)
    window.scrollTo({ top: 0 })
  }

  const selectedGroup = groups.find((g) => g.date === selected)
  const upcoming = groups.filter((g) => g.date > today && g.date !== selected)

  return (
    <div className="screen">
      <header className="list-header">
        <div className="list-header-top">
          <h1 className="list-title">やること</h1>
          <div className="period-nav" role="group" aria-label="日の移動">
            <button type="button" className="period-btn" onClick={() => moveTo(addDays(selected, -1))} aria-label="前の日">
              <IconChevronLeft className="icon icon-sm" />
            </button>
            <button type="button" className="period-btn" onClick={() => moveTo(addDays(selected, 1))} aria-label="次の日">
              <IconChevronRight className="icon icon-sm" />
            </button>
          </div>
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

      {error && !tasksQ.data ? (
        <div className="inline-error" role="alert">
          <p>{errorMessage(error, '一覧を読み込み')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void tasksQ.refetch()}>
            再読み込み
          </button>
        </div>
      ) : null}

      {loading ? <DelayedLoading /> : null}

      {loading ? null : (
        <SelectedDaySection
          key={selected}
          date={selected}
          today={today}
          tasks={selectedGroup?.tasks ?? []}
          urgent={urgent}
          routines={selectedGroup?.routines ?? []}
          showAll={showAll}
          online={online}
          onError={onError}
          onBackToToday={() => moveTo(today)}
        />
      )}
      <OpenSection
        list={rest}
        isError={openQ.isError && !openQ.data}
        error={openQ.error}
        onRetry={() => void openQ.refetch()}
        today={today}
        online={online}
        onError={onError}
      />
      {loading ? null : (
        <section className="upcoming" aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="group-heading">
            これから
          </h2>
          {upcoming.length === 0 ? (
            <p className="empty-note">これからの予定はありません</p>
          ) : (
            upcoming.map((g) => (
              <DayGroupSection key={g.date} group={g} showAll={showAll} online={online} onError={onError} />
            ))
          )}
        </section>
      )}
    </div>
  )
}

/** 「今日」「明日」「昨日」、それ以外は日付だけ */
function relativeDayName(date: DateStr, today: DateStr): string | null {
  if (date === today) return '今日'
  if (date === addDays(today, 1)) return '明日'
  if (date === addDays(today, -1)) return '昨日'
  return null
}

/**
 * 上のカード：選んだ日のタスク →（今日なら）締め切りが近い対応中 → ルーティーンのまとめ → 追加（SPEC §1.1）。
 * 「＋ 追加」はこの日に入る。
 */
function SelectedDaySection({
  date,
  today,
  tasks,
  urgent,
  routines,
  showAll,
  online,
  onError,
  onBackToToday,
}: {
  date: DateStr
  today: DateStr
  tasks: TaskWithAttachments[]
  urgent: TaskWithAttachments[]
  routines: RoutineItem[]
  showAll: boolean
  online: boolean
  onError: OnError
  onBackToToday: () => void
}) {
  const name = relativeDayName(date, today)
  const label = name ?? formatDayLabel(date)
  return (
    <section className="day day-today" aria-labelledby="today-heading" data-date={date}>
      <div className="today-head">
        <h2 id="today-heading" className="today-heading">
          {name ?? formatDayLabel(date)}
          {name ? <span className="today-date">{formatDayLabel(date)}</span> : null}
        </h2>
        {date === today ? null : (
          <button type="button" className="btn btn-secondary btn-compact back-to-today" onClick={onBackToToday}>
            今日へ戻る
          </button>
        )}
      </div>
      <div className="card">
        {tasks.length + urgent.length > 0 ? (
          <ul className="rows">
            {tasks.map((t) => (
              <TaskItem key={t.id} task={t} online={online} onError={onError} />
            ))}
            {urgent.map((t) => (
              <TaskItem key={t.id} task={t} note={openTaskNote(t, date)} online={online} onError={onError} />
            ))}
          </ul>
        ) : null}
        <RoutineGroup
          date={date}
          items={routines}
          showAll={showAll}
          online={online}
          onError={onError}
          remember={date === today}
        />
        <div className="quick-add">
          <QuickAdd date={date} label={label} disabled={!online} onError={onError} />
        </div>
      </div>
    </section>
  )
}

/** 今日以外の1日分（「これから」や、今日を含まない期間） */
function DayGroupSection({
  group,
  showAll,
  online,
  onError,
}: {
  group: DayGroup<TaskWithAttachments, RoutineItem>
  showAll: boolean
  online: boolean
  onError: OnError
}) {
  const dow = dayOfWeek(group.date)
  const dayClass = dow === 6 ? 'day-sat' : dow === 0 ? 'day-sun' : ''
  const headingId = `day-${group.date}`
  return (
    <section className="day" aria-labelledby={headingId} data-date={group.date}>
      <h3 id={headingId} className={`day-heading ${dayClass}`}>
        {formatDayLabel(group.date)}
      </h3>
      <div className="card">
        {group.tasks.length > 0 ? (
          <ul className="rows">
            {group.tasks.map((t) => (
              <TaskItem key={t.id} task={t} online={online} onError={onError} />
            ))}
          </ul>
        ) : null}
        <RoutineGroup date={group.date} items={group.routines} showAll={showAll} online={online} onError={onError} />
      </div>
    </section>
  )
}

/**
 * ルーティーンのまとめ行。タップで個別の行を開閉する。
 * 開閉状態は「今日」のぶんだけ端末に保存する（過去の日は毎回閉じた状態から。全部開くと一覧が長くなるため）
 */
function RoutineGroup({
  date,
  items,
  showAll,
  online,
  onError,
  remember = false,
}: {
  date: DateStr
  items: RoutineItem[]
  showAll: boolean
  online: boolean
  onError: OnError
  remember?: boolean
}) {
  const [expanded, setExpanded] = useState(() => remember && readLocal(ROUTINES_EXPANDED_KEY) === 'true')
  const toggleRoutine = useToggleRoutine()
  if (items.length === 0) return null
  const doneCount = items.filter((r) => r.done).length
  const allDone = doneCount === items.length
  const listId = `routines-${date}`
  const visible = items.filter((r) => showAll || !r.done)
  const flip = () => {
    const next = !expanded
    setExpanded(next)
    if (remember) writeLocal(ROUTINES_EXPANDED_KEY, String(next))
  }
  return (
    <div className="routine-group">
      <button
        type="button"
        className={`routine-summary${allDone ? ' routine-summary-done' : ''}`}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={flip}
      >
        <IconRepeat className="icon icon-sm routine-summary-icon" />
        <span className="routine-summary-count">
          ルーティーン {doneCount}/{items.length} 済
        </span>
        <span className="routine-summary-names">{items.map((r) => r.routine.title).join('・')}</span>
        <IconChevronRight className={`icon icon-sm open-chevron${expanded ? ' open-chevron-on' : ''}`} />
      </button>
      {expanded ? (
        <ul className="rows" id={listId}>
          {visible.map((r) => (
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
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function TaskItem({
  task,
  note,
  online,
  onError,
}: {
  task: TaskWithAttachments
  note?: { text: string; overdue: boolean }
  online: boolean
  onError: OnError
}) {
  const toggle = useToggleTask()
  return (
    <TaskRow
      title={task.title}
      done={task.done}
      repeat={false}
      clip={task.attachments.length > 0}
      note={note}
      disabled={!online}
      detail={{ name: 'task', id: task.id }}
      onToggle={() =>
        toggle.mutate({ id: task.id, done: !task.done }, { onError: (e) => onError(e, '完了状態を変更') })
      }
    />
  )
}

/** 「対応中」：日付を過ぎた未完了のタスク（SPEC §3.7）。初期値は閉じる。今日に出したものは除いて渡される */
function OpenSection({
  list,
  isError,
  error,
  onRetry,
  today,
  online,
  onError,
}: {
  list: TaskWithAttachments[]
  isError: boolean
  error: unknown
  onRetry: () => void
  today: DateStr
  online: boolean
  onError: OnError
}) {
  const [expanded, setExpanded] = useState(() => readLocal(OPEN_EXPANDED_KEY) === 'true')
  useEffect(() => writeLocal(OPEN_EXPANDED_KEY, String(expanded)), [expanded])
  if (isError) {
    return (
      <section className="open-section card" aria-labelledby="open-heading">
        <h2 id="open-heading" className="open-heading open-heading-plain">
          対応中
        </h2>
        <div className="inline-error" role="alert">
          <p>{errorMessage(error, '対応中のタスクを読み込み')}</p>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            再読み込み
          </button>
        </div>
      </section>
    )
  }
  if (list.length === 0) return null
  const oldest = oldestDate(list)
  return (
    <section className="open-section card" aria-labelledby="open-heading">
      <h2 id="open-heading" className="open-heading">
        <button
          type="button"
          className="open-toggle"
          aria-expanded={expanded}
          aria-controls="open-rows"
          onClick={() => setExpanded((v) => !v)}
        >
          <IconChevronRight className={`icon icon-sm open-chevron${expanded ? ' open-chevron-on' : ''}`} />
          対応中
          <span className="open-count">{list.length}件</span>
          {oldest ? <span className="open-oldest">いちばん古い {formatMonthDay(oldest)}〜</span> : null}
        </button>
      </h2>
      {expanded ? (
        <ul className="rows" id="open-rows">
          {list.map((t) => (
            <TaskItem key={t.id} task={t} note={openTaskNote(t, today)} online={online} onError={onError} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function formatMonthDay(s: DateStr): string {
  const { m, d } = parse(s)
  return `${m}月${d}日`
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

function TaskRow({
  title,
  done,
  repeat,
  clip,
  note,
  disabled,
  detail,
  onToggle,
}: {
  title: string
  done: boolean
  repeat: boolean
  clip: boolean
  note?: { text: string; overdue: boolean }
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
        {note ? (
          <span className="row-text">
            <span className="row-title">{title}</span>
            <span className={`row-note${note.overdue ? ' row-note-overdue' : ''}`}>{note.text}</span>
          </span>
        ) : (
          <span className="row-title">{title}</span>
        )}
        {repeat ? <IconRepeat className="icon icon-sm row-icon" title="ルーティーン" /> : null}
        {clip ? <IconClip className="icon icon-sm row-icon" title="画像あり" /> : null}
      </Link>
      <Link to={detail} className="icon-btn row-detail" aria-label={`${title} の詳細`}>
        <IconChevronRight />
      </Link>
    </li>
  )
}

/** 「＋ 追加」。上のカードで表示している日に追加する（SPEC §1.1） */
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
  const formRef = useRef<HTMLFormElement>(null)
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

  const close = () => setOpen(false)

  // フォームの外をタップしたら、入力済みなら追加して閉じる。
  // フォーカスが外れたこと（blur）では閉じない：iPhone ではキーボードを下げただけでフォーカスが外れるため
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && formRef.current?.contains(e.target)) return
      submitRef.current()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

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
      ref={formRef}
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
            close()
          }
        }}
      />
    </form>
  )
}
