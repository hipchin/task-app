import { addDays, compare, type DateStr, weekdayLabel } from './date.ts'
import type { Routine, RuleType } from './types.ts'

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
  weekdays: '平日',
}

/** ルールの要約（例「毎週 月・水・金」「毎月 1日・15日」） */
export function summarizeRule(r: Pick<Routine, 'rule_type' | 'rule_days'>): string {
  const days = [...(r.rule_days ?? [])].sort((a, b) => a - b)
  switch (r.rule_type) {
    case 'daily':
      return '毎日'
    case 'weekdays':
      return '平日（月〜金）'
    case 'weekly':
      // 月曜始まりで並べる
      return `毎週 ${[...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(weekdayLabel).join('・')}`
    case 'monthly':
      return `毎月 ${days.map((d) => `${d}日`).join('・')}`
  }
}

export function isEnded(r: Pick<Routine, 'end_date'>, today: DateStr): boolean {
  return r.end_date !== null && compare(r.end_date, today) < 0
}

export function normalizeRuleDays(type: RuleType, days: readonly number[]): number[] | null {
  if (type === 'daily' || type === 'weekdays') return null
  const max = type === 'weekly' ? 6 : 31
  const min = type === 'weekly' ? 0 : 1
  return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= min && d <= max).sort((a, b) => a - b)
}

function sameDays(a: readonly number[] | null, b: readonly number[] | null): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

export interface RoutineDraft {
  title: string
  memo: string
  rule_type: RuleType
  rule_days: number[] | null
  start_date: DateStr
  end_date: DateStr | null
  remind_time: string | null
}

/** ルール種別・曜日・開始日が変わったか（SPEC §3.2） */
export function isRuleChanged(before: Routine, after: RoutineDraft): boolean {
  return (
    before.rule_type !== after.rule_type ||
    !sameDays(normalizeRuleDays(before.rule_type, before.rule_days ?? []), after.rule_days) ||
    before.start_date !== after.start_date
  )
}

export type RoutineSavePlan =
  | { kind: 'update'; patch: RoutineDraft }
  | {
      kind: 'split'
      /** 既存ルーティーンの end_date（昨日） */
      endOldAt: DateStr
      /** 新しいルーティーン */
      create: RoutineDraft
      /** この日以降の routine_logs を新しいルーティーンへ付け替える */
      moveLogsFrom: DateStr
    }

/**
 * 既存ルーティーンの保存方法を決める（SPEC §3.2）。
 * - タイトル・メモ・通知時刻・終了日だけの変更 → そのまま更新
 * - ルールが変わり、かつ過去（昨日以前）に表示実績がある → 昨日で終了し、今日開始の新ルーティーンを作る
 * - まだ始まっていない（開始日が今日以降）ルーティーンは履歴がないので、そのまま更新する
 * 新しい開始日は「今日」を基本とし、利用者が今日より後の日付を指定した場合はその日付を使う。
 */
export function planRoutineSave(before: Routine, after: RoutineDraft, today: DateStr): RoutineSavePlan {
  if (!isRuleChanged(before, after) || compare(before.start_date, today) >= 0) {
    return { kind: 'update', patch: after }
  }
  const start = compare(after.start_date, today) > 0 ? after.start_date : today
  return {
    kind: 'split',
    endOldAt: addDays(today, -1),
    create: { ...after, start_date: start },
    moveLogsFrom: today,
  }
}

/** 「今日以降を終了する」ときの end_date（開始前なら開始日の前日＝表示なし） */
export function endDateForStop(r: Pick<Routine, 'start_date'>, today: DateStr): DateStr {
  const yesterday = addDays(today, -1)
  const beforeStart = addDays(r.start_date, -1)
  return compare(beforeStart, yesterday) > 0 ? beforeStart : yesterday
}
