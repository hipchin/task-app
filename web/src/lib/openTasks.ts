import { diffDays, parse, type DateStr } from './date.ts'

/** 「対応中」の対象（SPEC §3.7）：未完了で日付が今日より前の通常タスク */
export function isOpenTask(t: { done: boolean; date: DateStr }, today: DateStr): boolean {
  return !t.done && t.date < today
}

/** 締め切りの近い順（なしは後ろ）→ 日付の古い順 → sort_order → 作成順 */
export function sortOpenTasks<T extends { due_date: DateStr | null; date: DateStr; sort_order: number; created_at: string }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1
      if (b.due_date === null) return -1
      return a.due_date.localeCompare(b.due_date)
    }
    return a.date.localeCompare(b.date) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  })
}

function md(s: DateStr): string {
  const { m, d } = parse(s)
  return `${m}月${d}日`
}

/** 行の下に出す補足と、超過しているかどうか */
export function openTaskNote(t: { date: DateStr; due_date: DateStr | null }, today: DateStr): { text: string; overdue: boolean } {
  if (t.due_date === null) return { text: `${md(t.date)}から`, overdue: false }
  const left = diffDays(today, t.due_date)
  const base = `締め切り ${md(t.due_date)}`
  if (left > 0) return { text: `${base}（あと${left}日）`, overdue: false }
  if (left === 0) return { text: `${base}（今日まで）`, overdue: false }
  return { text: `${base}（${-left}日超過）`, overdue: true }
}
