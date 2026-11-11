import { describe, expect, it } from 'vitest'
import { isOpenTask, openTaskNote, sortOpenTasks } from './openTasks'

const t = (over: Partial<{ id: string; date: string; due_date: string | null; sort_order: number; created_at: string }>) => ({
  id: 'x',
  date: '2026-11-01',
  due_date: null,
  sort_order: 0,
  created_at: '2026-11-01T00:00:00Z',
  ...over,
})

describe('isOpenTask', () => {
  it('未完了で今日より前の日付だけが対象', () => {
    expect(isOpenTask({ done: false, date: '2026-11-10' }, '2026-11-11')).toBe(true)
    expect(isOpenTask({ done: false, date: '2026-11-11' }, '2026-11-11')).toBe(false)
    expect(isOpenTask({ done: true, date: '2026-11-01' }, '2026-11-11')).toBe(false)
  })
})

describe('sortOpenTasks', () => {
  it('締め切りの近い順、締め切りなしは後ろ、同じなら日付の古い順', () => {
    const list = [
      t({ id: 'none-old', date: '2026-10-01' }),
      t({ id: 'due-late', due_date: '2026-11-30' }),
      t({ id: 'none-new', date: '2026-11-05' }),
      t({ id: 'due-soon', due_date: '2026-11-12' }),
    ]
    expect(sortOpenTasks(list).map((x) => x.id)).toEqual(['due-soon', 'due-late', 'none-old', 'none-new'])
  })
})

describe('openTaskNote', () => {
  const today = '2026-11-11'
  it('締め切りなしは開始日', () => {
    expect(openTaskNote({ date: '2026-11-03', due_date: null }, today)).toEqual({ text: '11月3日から', overdue: false })
  })
  it('残り日数・今日まで・超過', () => {
    expect(openTaskNote({ date: '2026-11-01', due_date: '2026-11-14' }, today).text).toBe('締め切り 11月14日（あと3日）')
    expect(openTaskNote({ date: '2026-11-01', due_date: '2026-11-11' }, today).text).toBe('締め切り 11月11日（今日まで）')
    expect(openTaskNote({ date: '2026-11-01', due_date: '2026-11-09' }, today)).toEqual({
      text: '締め切り 11月9日（2日超過）',
      overdue: true,
    })
  })
  it('月またぎ・年またぎ', () => {
    expect(openTaskNote({ date: '2026-12-20', due_date: '2027-01-02' }, '2026-12-30').text).toBe('締め切り 1月2日（あと3日）')
  })
})
