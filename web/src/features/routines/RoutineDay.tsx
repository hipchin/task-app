import { useId, useState } from 'react'
import { routineKeys, upsertRoutineLog, useRoutineLog, useRoutines, useSaveRoutineLogMemo, useToggleRoutine } from './api'
import { AttachmentsSection } from '../attachments/AttachmentsSection'
import { ScreenHeader } from '../../components/ScreenHeader'
import { AutoTextarea } from '../../components/AutoTextarea'
import { Link } from '../../components/Link'
import { formatDayLabel, isDateStr } from '../../lib/date'
import { errorMessage } from '../../lib/errors'
import { useOnline } from '../../lib/online'
import { summarizeRule } from '../../lib/routineRule'
import type { Routine, RoutineLog } from '../../lib/types'
import { IconRepeat } from '../../components/Icons'
import { useQueryClient } from '@tanstack/react-query'

/** ルーティーン由来の行から開く詳細（SPEC §1.2） */
export function RoutineDay({ routineId, date }: { routineId: string; date: string }) {
  const routines = useRoutines()
  const logQ = useRoutineLog(routineId, date)
  const routine = routines.data?.find((r) => r.id === routineId)

  if (routines.isPending || logQ.isPending) {
    return (
      <div className="screen">
        <ScreenHeader title="ルーティーン" />
        <p className="loading-text">読み込み中…</p>
      </div>
    )
  }
  if (!routine || !isDateStr(date) || logQ.isError) {
    return (
      <div className="screen">
        <ScreenHeader title="ルーティーン" />
        <div className="inline-error" role="alert">
          <p>{logQ.isError ? errorMessage(logQ.error, '記録を読み込め') : 'このルーティーンは見つかりません。削除された可能性があります。'}</p>
        </div>
      </div>
    )
  }
  return <RoutineDayForm key={`${routineId}|${date}`} routine={routine} date={date} log={logQ.data ?? null} />
}

function RoutineDayForm({ routine, date, log }: { routine: Routine; date: string; log: RoutineLog | null }) {
  const online = useOnline()
  const qc = useQueryClient()
  const toggle = useToggleRoutine()
  const saveMemo = useSaveRoutineLogMemo()
  const [memo, setMemo] = useState(log?.memo ?? '')
  const [done, setDone] = useState(log?.done ?? false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const memoId = useId()
  const doneId = useId()

  return (
    <div className="screen">
      <ScreenHeader title="ルーティーン" />
      <div className="form">
        <div className="routine-day-head">
          <p className="routine-day-title">
            <IconRepeat className="icon icon-sm" title="ルーティーン" />
            {routine.title}
          </p>
          <p className="field-hint">
            {formatDayLabel(date)} ・ {summarizeRule(routine)}
          </p>
        </div>

        <div className="field field-inline">
          <input
            id={doneId}
            type="checkbox"
            className="checkbox"
            checked={done}
            disabled={!online}
            onChange={(e) => {
              const next = e.target.checked
              setDone(next)
              toggle.mutate(
                { routineId: routine.id, date, done: next },
                {
                  onError: (err) => {
                    setDone(!next)
                    setMessage({ kind: 'error', text: errorMessage(err, '完了状態を変更') })
                  },
                },
              )
            }}
          />
          <label htmlFor={doneId}>この日の完了状態（完了）</label>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={memoId}>
            この日のメモ
          </label>
          <fieldset disabled={!online} className="form-fields">
            <AutoTextarea id={memoId} value={memo} onChange={setMemo} maxLength={20000} />
          </fieldset>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!online || saveMemo.isPending || memo === (log?.memo ?? '')}
              aria-busy={saveMemo.isPending}
              onClick={() =>
                saveMemo.mutate(
                  { routineId: routine.id, date, memo },
                  {
                    onSuccess: () => setMessage({ kind: 'ok', text: 'メモを保存しました。' }),
                    onError: (e) => setMessage({ kind: 'error', text: errorMessage(e, 'メモを保存') }),
                  },
                )
              }
            >
              メモを保存
            </button>
          </div>
          {message ? (
            <p className={message.kind === 'error' ? 'field-error' : 'field-ok'} role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          ) : null}
        </div>

        <AttachmentsSection
          owner={log ? { kind: 'routineLog', id: log.id } : null}
          disabled={!online}
          resolveOwner={async () => {
            const l = await upsertRoutineLog(routine.id, date, {})
            qc.setQueryData(routineKeys.log(routine.id, date), l)
            return { kind: 'routineLog', id: l.id }
          }}
        />

        {routine.memo ? (
          <div className="field">
            <span className="field-label">ルーティーンのメモ</span>
            <p className="memo-text">{routine.memo}</p>
          </div>
        ) : null}

        <Link to={{ name: 'routineEdit', id: routine.id }} className="text-link">
          ルーティーン本体を編集
        </Link>
      </div>
    </div>
  )
}
