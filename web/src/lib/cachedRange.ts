import { addDays, isDateStr, type DateStr } from './date.ts'
import { isOpenTask, sortOpenTasks } from './openTasks.ts'

/** キャッシュ済みの期間ごとの一覧（[from, to, 行]） */
export type CachedRange<T> = readonly [DateStr, DateStr, T[]]

/**
 * 期間の一覧がまだキャッシュに無いとき（日付が変わって鍵が変わった直後など）に先に出す仮の一覧。
 * 開始日 from を含むキャッシュのうち、いちばん先まで持っているものから [from, to] の行を取り出す。
 * from を含むものが無ければ出さない（読み込み中の表示にする。空の日を一瞬見せないため）。
 * 取り出した期間の終わりより先の日は、取得が終わるまで空になる。
 */
export function pickCachedRange<T extends { date: DateStr }>(
  ranges: ReadonlyArray<CachedRange<T>>,
  from: DateStr,
  to: DateStr,
): T[] | undefined {
  let best: CachedRange<T> | undefined
  for (const r of ranges) {
    const [f, t] = r
    if (f > from || t < from) continue
    if (!best || t > best[1]) best = r
  }
  return best ? best[2].filter((x) => x.date >= from && x.date <= to) : undefined
}

/**
 * 「対応中」がまだキャッシュに無いときの仮の一覧。
 * 前の日の「対応中」と、期間の一覧にある未完了で今日より前の行を合わせる（同じ行は1つにする）。
 * どちらも無ければ出さない。
 */
export function pickCachedOpenTasks<
  T extends { id: string; done: boolean; date: DateStr; due_date: DateStr | null; sort_order: number; created_at: string },
>(openLists: ReadonlyArray<T[]>, ranges: ReadonlyArray<CachedRange<T>>, today: DateStr, limit: number): T[] | undefined {
  if (openLists.length === 0 && ranges.length === 0) return undefined
  const byId = new Map<string, T>()
  for (const list of openLists) for (const t of list) if (isOpenTask(t, today)) byId.set(t.id, t)
  // 期間の一覧のほうが新しいことがあるので後から上書きする
  for (const [, , list] of ranges) for (const t of list) if (t.date < today) byId.set(t.id, t)
  const merged = [...byId.values()].filter((t) => isOpenTask(t, today))
  return sortOpenTasks(merged).slice(0, limit)
}

/** ['tasks', from, to] / ['routineLogs', from, to] の形の鍵から期間を取り出す */
export function rangeOfKey(key: readonly unknown[]): { from: DateStr; to: DateStr } | null {
  if (key.length !== 3) return null
  const [, from, to] = key
  if (typeof from !== 'string' || typeof to !== 'string' || !isDateStr(from) || !isDateStr(to)) return null
  return { from, to }
}

/**
 * 端末（IndexedDB）に保存するクエリか。起動時は保存分をすべて読み終えるまで何も出せないので、小さく保つ。
 * - 期間の一覧は、今日（または昨日）から始まるものだけ残す。‹ › で過去の日へ動いたときの一覧は残さない
 * - 添付の一覧は残さない（署名付きURLは1時間で切れるので、次に開いたときには使えない）
 */
export function shouldPersistQuery(key: readonly unknown[], today: DateStr): boolean {
  const head = key[0]
  if (head === 'attachments') return false
  if (head === 'tasks' || head === 'routineLogs') {
    const range = rangeOfKey(key)
    if (range) return range.from >= addDays(today, -1)
  }
  return true
}
