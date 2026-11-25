import { describe, expect, it } from 'vitest'
import { pickCachedOpenTasks, pickCachedRange, rangeOfKey, shouldPersistQuery, type CachedRange } from './cachedRange'

type Row = { id: string; date: string; done: boolean; due_date: string | null; sort_order: number; created_at: string }

function row(id: string, date: string, extra: Partial<Row> = {}): Row {
  return { id, date, done: false, due_date: null, sort_order: 0, created_at: '2026-11-01T00:00:00Z', ...extra }
}

describe('pickCachedRange', () => {
  it('日付が変わった翌朝：前日の期間から今日以降の行を取り出す', () => {
    const ranges: CachedRange<Row>[] = [['2026-11-24', '2026-12-23', [row('a', '2026-11-24'), row('b', '2026-11-25'), row('c', '2026-12-23')]]]
    expect(pickCachedRange(ranges, '2026-11-25', '2026-12-24')?.map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('開始日を含むキャッシュが無ければ出さない（過去の日へ移動したときなど）', () => {
    const ranges: CachedRange<Row>[] = [['2026-11-25', '2026-12-24', [row('a', '2026-11-25')]]]
    expect(pickCachedRange(ranges, '2026-11-20', '2026-12-24')).toBeUndefined()
    expect(pickCachedRange([], '2026-11-25', '2026-12-24')).toBeUndefined()
  })

  it('開始日を含むもののうち、いちばん先まであるものを使う', () => {
    const ranges: CachedRange<Row>[] = [
      ['2026-11-20', '2026-11-26', [row('short', '2026-11-25')]],
      ['2026-11-24', '2026-12-23', [row('long', '2026-11-25')]],
    ]
    expect(pickCachedRange(ranges, '2026-11-25', '2026-12-24')?.map((r) => r.id)).toEqual(['long'])
  })

  it('取り出した行が0件でも空の一覧として出す', () => {
    const ranges: CachedRange<Row>[] = [['2026-11-24', '2026-12-23', []]]
    expect(pickCachedRange(ranges, '2026-11-25', '2026-12-24')).toEqual([])
  })
})

describe('pickCachedOpenTasks', () => {
  const today = '2026-11-25'

  it('前日の「対応中」と、昨日の未完了タスクを合わせる', () => {
    const open = [[row('old', '2026-11-20')]]
    const ranges: CachedRange<Row>[] = [['2026-11-24', '2026-12-23', [row('y', '2026-11-24'), row('t', '2026-11-25')]]]
    expect(pickCachedOpenTasks(open, ranges, today, 300)?.map((r) => r.id)).toEqual(['old', 'y'])
  })

  it('完了済みは除き、同じ行は期間の一覧の新しい状態を使う', () => {
    const open = [[row('x', '2026-11-24'), row('d', '2026-11-20', { done: true })]]
    const ranges: CachedRange<Row>[] = [['2026-11-24', '2026-12-23', [row('x', '2026-11-24', { done: true })]]]
    expect(pickCachedOpenTasks(open, ranges, today, 300)).toEqual([])
  })

  it('締め切りの近い順に並べ、件数で切る', () => {
    const open = [[row('a', '2026-11-20'), row('b', '2026-11-21', { due_date: '2026-11-30' }), row('c', '2026-11-22')]]
    expect(pickCachedOpenTasks(open, [], today, 2)?.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('キャッシュが何も無ければ出さない', () => {
    expect(pickCachedOpenTasks([], [], today, 300)).toBeUndefined()
  })
})

describe('rangeOfKey', () => {
  it('期間の鍵だけを読む', () => {
    expect(rangeOfKey(['tasks', '2026-11-25', '2026-12-24'])).toEqual({ from: '2026-11-25', to: '2026-12-24' })
    expect(rangeOfKey(['tasks', 'open', '2026-11-25'])).toBeNull()
    expect(rangeOfKey(['routines'])).toBeNull()
  })
})

describe('shouldPersistQuery', () => {
  const today = '2026-11-25'

  it('今日・昨日から始まる期間は残し、それより前は残さない', () => {
    expect(shouldPersistQuery(['tasks', '2026-11-25', '2026-12-24'], today)).toBe(true)
    expect(shouldPersistQuery(['routineLogs', '2026-11-24', '2026-12-23'], today)).toBe(true)
    expect(shouldPersistQuery(['tasks', '2026-11-10', '2026-12-24'], today)).toBe(false)
    expect(shouldPersistQuery(['routineLogs', '2026-11-10', '2026-12-24'], today)).toBe(false)
  })

  it('添付の一覧は残さず、それ以外は残す', () => {
    expect(shouldPersistQuery(['attachments', 'task', 'x'], today)).toBe(false)
    expect(shouldPersistQuery(['tasks', 'open', today], today)).toBe(true)
    expect(shouldPersistQuery(['routines'], today)).toBe(true)
    expect(shouldPersistQuery(['task', 'x'], today)).toBe(true)
  })
})
