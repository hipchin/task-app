import { useId, useState } from 'react'
import { useDeleteRoutine, useRoutines, useSaveRoutine, useStopRoutine } from './api'
import { ScreenHeader } from '../../components/ScreenHeader'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AutoTextarea } from '../../components/AutoTextarea'
import { compare, isDateStr, todayJst, weekdayLabel } from '../../lib/date'
import { errorMessage } from '../../lib/errors'
import { useOnline } from '../../lib/online'
import { goBack } from '../../lib/router'
import { isEnded, isRuleChanged, normalizeRuleDays, RULE_TYPE_LABELS, type RoutineDraft } from '../../lib/routineRule'
import type { Routine, RuleType } from '../../lib/types'

export function RoutineEdit({ id }: { id: string | null }) {
  const q = useRoutines()
  if (id === null) return <RoutineForm routine={null} />
  if (q.isPending) {
    return (
      <div className="screen">
        <ScreenHeader title="ルーティーン" backLabel="戻る" backTo={{ name: 'routines' }} />
        <p className="loading-text">読み込み中…</p>
      </div>
    )
  }
  const routine = q.data?.find((r) => r.id === id)
  if (!routine) {
    return (
      <div className="screen">
        <ScreenHeader title="ルーティーン" backLabel="戻る" backTo={{ name: 'routines' }} />
        <div className="inline-error" role="alert">
          <p>{q.isError ? errorMessage(q.error, '読み込め') : 'このルーティーンは見つかりません。削除された可能性があります。'}</p>
        </div>
      </div>
    )
  }
  return <RoutineForm key={routine.id + routine.updated_at} routine={routine} />
}

const RULE_TYPES: RuleType[] = ['daily', 'weekly', 'monthly', 'weekdays']
// 月曜始まりで並べる
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function RoutineForm({ routine }: { routine: Routine | null }) {
  const online = useOnline()
  const today = todayJst()
  const save = useSaveRoutine()
  const stop = useStopRoutine()
  const del = useDeleteRoutine()
  const [title, setTitle] = useState(routine?.title ?? '')
  const [memo, setMemo] = useState(routine?.memo ?? '')
  const [ruleType, setRuleType] = useState<RuleType>(routine?.rule_type ?? 'daily')
  const [weekDays, setWeekDays] = useState<number[]>(routine?.rule_type === 'weekly' ? (routine.rule_days ?? []) : [])
  const [monthDays, setMonthDays] = useState<number[]>(routine?.rule_type === 'monthly' ? (routine.rule_days ?? []) : [])
  const [startDate, setStartDate] = useState(routine?.start_date ?? today)
  const [endDate, setEndDate] = useState(routine?.end_date ?? '')
  const [remindTime, setRemindTime] = useState(routine?.remind_time?.slice(0, 5) ?? '')
  const [errors, setErrors] = useState<Partial<Record<'title' | 'days' | 'start' | 'end' | 'form', string>>>({})
  const [confirm, setConfirm] = useState<'stop' | 'delete' | null>(null)
  const fid = useId()

  const draft: RoutineDraft = {
    title: title.trim(),
    memo,
    rule_type: ruleType,
    rule_days: normalizeRuleDays(ruleType, ruleType === 'weekly' ? weekDays : monthDays),
    start_date: startDate,
    end_date: endDate || null,
    remind_time: remindTime || null,
  }
  const ruleChanged = routine !== null && compare(routine.start_date, today) < 0 && isRuleChanged(routine, draft)

  const submit = () => {
    const e: typeof errors = {}
    if (!draft.title) e.title = 'タイトルを入力してください。'
    if ((ruleType === 'weekly' || ruleType === 'monthly') && (draft.rule_days ?? []).length === 0) {
      e.days = ruleType === 'weekly' ? '曜日を1つ以上選んでください。' : '日付を1つ以上選んでください。'
    }
    if (!isDateStr(startDate)) e.start = '開始日を入力してください。'
    if (draft.end_date && (!isDateStr(draft.end_date) || draft.end_date < startDate)) e.end = '終了日は開始日以降にしてください。'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    save.mutate(
      { before: routine, draft },
      {
        onSuccess: () => goBack({ name: 'routines' }),
        onError: (err) => setErrors({ form: errorMessage(err, '保存') }),
      },
    )
  }

  const toggleIn = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="screen">
      <ScreenHeader title={routine ? 'ルーティーンを編集' : '新しいルーティーン'} backLabel="戻る" backTo={{ name: 'routines' }} />
      {!online ? <p className="field-hint form-pad">オフラインのため編集できません。</p> : null}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <fieldset disabled={!online} className="form-fields">
          <div className="field">
            <label className="field-label" htmlFor={`${fid}-title`}>
              タイトル
            </label>
            <input
              id={`${fid}-title`}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              aria-invalid={errors.title ? true : undefined}
            />
            {errors.title ? <p className="field-error">{errors.title}</p> : null}
          </div>

          <fieldset className="field">
            <legend className="field-label">くり返し</legend>
            <div className="segmented" role="radiogroup">
              {RULE_TYPES.map((t) => (
                <label key={t} className={`segment${ruleType === t ? ' segment-on' : ''}`}>
                  <input type="radio" name={`${fid}-rule`} value={t} checked={ruleType === t} onChange={() => setRuleType(t)} />
                  {RULE_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
            {ruleType === 'weekly' ? (
              <div className="chips" role="group" aria-label="曜日">
                {WEEK_ORDER.map((d) => (
                  <label key={d} className={`chip${weekDays.includes(d) ? ' chip-on' : ''}${d === 6 ? ' day-sat' : d === 0 ? ' day-sun' : ''}`}>
                    <input type="checkbox" checked={weekDays.includes(d)} onChange={() => setWeekDays((xs) => toggleIn(xs, d))} />
                    {weekdayLabel(d)}
                  </label>
                ))}
              </div>
            ) : null}
            {ruleType === 'monthly' ? (
              <>
                <div className="chips chips-month" role="group" aria-label="日付">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <label key={d} className={`chip${monthDays.includes(d) ? ' chip-on' : ''}`}>
                      <input type="checkbox" checked={monthDays.includes(d)} onChange={() => setMonthDays((xs) => toggleIn(xs, d))} />
                      {d}
                    </label>
                  ))}
                </div>
                {/* TODO-3: 存在しない日（31日など）の月はスキップ（v1の仮仕様） */}
                <p className="field-hint">29〜31日を選んだ場合、その日がない月は表示されません。</p>
              </>
            ) : null}
            {ruleType === 'weekdays' ? <p className="field-hint">月〜金に表示します。祝日も表示されます。</p> : null}
            {errors.days ? <p className="field-error">{errors.days}</p> : null}
          </fieldset>

          <div className="field-pair">
            <div className="field">
              <label className="field-label" htmlFor={`${fid}-start`}>
                開始日
              </label>
              <input id={`${fid}-start`} type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              {errors.start ? <p className="field-error">{errors.start}</p> : null}
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${fid}-end`}>
                終了日（任意）
              </label>
              <input id={`${fid}-end`} type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {errors.end ? <p className="field-error">{errors.end}</p> : null}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor={`${fid}-remind`}>
              通知時刻（任意）
            </label>
            <div className="input-row">
              <input id={`${fid}-remind`} type="time" className="input" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} />
              {remindTime ? (
                <button type="button" className="btn btn-secondary" onClick={() => setRemindTime('')}>
                  解除
                </button>
              ) : null}
            </div>
            <p className="field-hint">通知は今後のアップデートで届くようになります。</p>
          </div>

          <div className="field">
            <label className="field-label" htmlFor={`${fid}-memo`}>
              メモ
            </label>
            <AutoTextarea id={`${fid}-memo`} value={memo} onChange={setMemo} maxLength={20000} />
          </div>
        </fieldset>

        {ruleChanged ? (
          <p className="notice" role="note">
            くり返しや開始日を変えると、昨日までの記録は今のルールのまま残り、今日から新しいルールになります。
          </p>
        ) : null}
        {errors.form ? (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!online || save.isPending} aria-busy={save.isPending}>
            保存
          </button>
        </div>

        {routine ? (
          <div className="danger-zone">
            {!isEnded(routine, today) ? (
              <button type="button" className="btn btn-secondary" disabled={!online} onClick={() => setConfirm('stop')}>
                今日以降を終了する
              </button>
            ) : null}
            <button type="button" className="btn btn-danger-text" disabled={!online} onClick={() => setConfirm('delete')}>
              完全に削除
            </button>
          </div>
        ) : null}
      </form>

      {routine ? (
        <>
          <ConfirmDialog
            open={confirm === 'stop'}
            title="今日以降を終了しますか？"
            message={`「${routine.title}」を今日から表示しなくなります。昨日までの記録は残ります。`}
            confirmLabel="終了する"
            busy={stop.isPending}
            onCancel={() => setConfirm(null)}
            onConfirm={() =>
              stop.mutate(routine, {
                onSuccess: () => goBack({ name: 'routines' }),
                onError: (e) => {
                  setConfirm(null)
                  setErrors({ form: errorMessage(e, '終了') })
                },
              })
            }
          />
          <ConfirmDialog
            open={confirm === 'delete'}
            title="完全に削除しますか？"
            message={`「${routine.title}」と、これまでのすべての完了記録・メモ・画像を削除します。元に戻せません。`}
            confirmLabel="完全に削除"
            danger
            busy={del.isPending}
            onCancel={() => setConfirm(null)}
            onConfirm={() =>
              del.mutate(routine, {
                onSuccess: () => goBack({ name: 'routines' }),
                onError: (e) => {
                  setConfirm(null)
                  setErrors({ form: errorMessage(e, '削除') })
                },
              })
            }
          />
        </>
      ) : null}
    </div>
  )
}
