import { addDays, eachDay, type DateStr } from './date.ts'

/** 締め切りが明日以前（超過・今日まで・明日まで）なら「今日」のセクションに出す（SPEC §3.7） */
export function isDueSoon(t: { due_date: DateStr | null }, today: DateStr): boolean {
  return t.due_date !== null && t.due_date <= addDays(today, 1)
}

/**
 * 対応中のタスクを「今日」に出すもの（urgent）と「対応中」に残すもの（rest）に分ける。
 * 今日のセクションを出していないとき（今日を含まない期間）は、すべて rest にする。
 * 並び順は入力の順を保つ。
 */
export function splitOpenTasks<T extends { due_date: DateStr | null }>(
  list: T[],
  today: DateStr,
  todayShown: boolean,
): { urgent: T[]; rest: T[] } {
  if (!todayShown) return { urgent: [], rest: list }
  const urgent: T[] = []
  const rest: T[] = []
  for (const t of list) (isDueSoon(t, today) ? urgent : rest).push(t)
  return { urgent, rest }
}

/** いちばん古い日付（なければ null） */
export function oldestDate(list: { date: DateStr }[]): DateStr | null {
  let min: DateStr | null = null
  for (const t of list) if (min === null || t.date < min) min = t.date
  return min
}

export interface DayGroup<T, R> {
  date: DateStr
  tasks: T[]
  routines: R[]
}

/**
 * 一覧に出す日だけを日付順に返す（SPEC §1.1）。
 * - 今日：期間に含まれていれば、空でも必ず出す
 * - 今日より前：通常タスクかルーティーンがある日（あとから完了を付けられるように）
 * - 今日より後：通常タスクがある日だけ。ルーティーンは出さない
 */
export function buildDayGroups<T extends { date: DateStr }, R extends { date: DateStr }>(
  from: DateStr,
  to: DateStr,
  today: DateStr,
  tasks: T[],
  routines: R[],
): DayGroup<T, R>[] {
  const tasksBy = groupBy(tasks)
  const routinesBy = groupBy(routines)
  const out: DayGroup<T, R>[] = []
  for (const d of eachDay(from, to)) {
    const dayTasks = tasksBy.get(d) ?? []
    const dayRoutines = d > today ? [] : (routinesBy.get(d) ?? [])
    if (d === today || dayTasks.length > 0 || dayRoutines.length > 0) {
      out.push({ date: d, tasks: dayTasks, routines: dayRoutines })
    }
  }
  return out
}

function groupBy<X extends { date: DateStr }>(list: X[]): Map<DateStr, X[]> {
  const map = new Map<DateStr, X[]>()
  for (const x of list) {
    const l = map.get(x.date)
    if (l) l.push(x)
    else map.set(x.date, [x])
  }
  return map
}
