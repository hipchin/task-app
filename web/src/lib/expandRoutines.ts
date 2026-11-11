import { compare, dayOfWeek, eachDay, parse, type DateStr } from './date.ts'
import type { Routine, RoutineLog } from './types.ts'

export interface RoutineOccurrence<R extends Routine = Routine, L extends RoutineLog = RoutineLog> {
  routine: R
  date: DateStr
  /** その日の記録（なければ未完了扱い） */
  log: L | null
  done: boolean
}

/** ルーティーンが日付 d に該当するか（SPEC §3.1） */
export function routineMatches(routine: Pick<Routine, 'rule_type' | 'rule_days' | 'start_date' | 'end_date'>, d: DateStr): boolean {
  if (compare(routine.start_date, d) > 0) return false
  if (routine.end_date !== null && compare(d, routine.end_date) > 0) return false
  const days = routine.rule_days ?? []
  switch (routine.rule_type) {
    case 'daily':
      return true
    case 'weekly':
      return days.includes(dayOfWeek(d))
    case 'monthly':
      // TODO-3: 存在しない日（例：31日）はその月はスキップする（v1の仮仕様）。
      // d の日付と一致するかだけを見るので、31日がない月は自然にスキップされる。
      return days.includes(parse(d).d)
    case 'weekdays': {
      // TODO-2: 日本の祝日は除外しない（v1の仮仕様）
      const w = dayOfWeek(d)
      return w >= 1 && w <= 5
    }
  }
}

/**
 * 表示期間 [from, to] のルーティーンを日ごとに展開する。
 * 繰り越しはしない：過去の未完了はその日に未完了のまま残る。
 * 結果は日付昇順、同じ日の中では sort_order → created_at 順。
 */
export function expandRoutines<R extends Routine, L extends RoutineLog>(
  routines: readonly R[],
  logs: readonly L[],
  from: DateStr,
  to: DateStr,
): RoutineOccurrence<R, L>[] {
  if (compare(from, to) > 0) return []
  const logMap = new Map<string, L>()
  for (const l of logs) logMap.set(`${l.routine_id}|${l.date}`, l)

  const sorted = [...routines].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )
  const out: RoutineOccurrence<R, L>[] = []
  for (const d of eachDay(from, to)) {
    for (const r of sorted) {
      if (!routineMatches(r, d)) continue
      const log = logMap.get(`${r.id}|${d}`) ?? null
      out.push({ routine: r, date: d, log, done: log?.done ?? false })
    }
  }
  return out
}
