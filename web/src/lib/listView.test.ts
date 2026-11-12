import { describe, expect, it } from 'vitest'
import { buildDayGroups, isDueSoon, oldestDate, splitOpenTasks } from './listView'

const today = '2026-11-12'

describe('isDueSoon', () => {
  it('締め切りが明日以前なら true、明後日以降や締め切りなしは false', () => {
    expect(isDueSoon({ due_date: '2026-11-10' }, today)).toBe(true)
    expect(isDueSoon({ due_date: '2026-11-12' }, today)).toBe(true)
    expect(isDueSoon({ due_date: '2026-11-13' }, today)).toBe(true)
    expect(isDueSoon({ due_date: '2026-11-14' }, today)).toBe(false)
    expect(isDueSoon({ due_date: null }, today)).toBe(false)
  })
  it('月末・年末をまたぐ', () => {
    expect(isDueSoon({ due_date: '2027-01-01' }, '2026-12-31')).toBe(true)
    expect(isDueSoon({ due_date: '2027-01-02' }, '2026-12-31')).toBe(false)
  })
})

describe('splitOpenTasks', () => {
  const list = [
    { id: 'over', due_date: '2026-11-10' },
    { id: 'tomorrow', due_date: '2026-11-13' },
    { id: 'later', due_date: '2026-11-20' },
    { id: 'none', due_date: null },
  ]
  it('締め切りが明日以前は urgent、それ以外は rest（順序は保つ）', () => {
    const { urgent, rest } = splitOpenTasks(list, today, true)
    expect(urgent.map((t) => t.id)).toEqual(['over', 'tomorrow'])
    expect(rest.map((t) => t.id)).toEqual(['later', 'none'])
  })
  it('今日のセクションを出していなければ、すべて rest', () => {
    const { urgent, rest } = splitOpenTasks(list, today, false)
    expect(urgent).toEqual([])
    expect(rest).toHaveLength(4)
  })
})

describe('oldestDate', () => {
  it('いちばん古い日付。空なら null', () => {
    expect(oldestDate([{ date: '2026-10-19' }, { date: '2026-07-18' }, { date: '2026-11-07' }])).toBe('2026-07-18')
    expect(oldestDate([])).toBeNull()
  })
})

describe('buildDayGroups', () => {
  const t = (id: string, date: string) => ({ id, date })
  it('今日は空でも出し、先の日はタスクがある日だけ。先の日のルーティーンは出さない', () => {
    const groups = buildDayGroups(
      '2026-11-12',
      '2026-11-16',
      today,
      [t('a', '2026-11-14')],
      [t('r1', '2026-11-12'), t('r2', '2026-11-13'), t('r3', '2026-11-14')],
    )
    expect(groups.map((g) => g.date)).toEqual(['2026-11-12', '2026-11-14'])
    expect(groups[0]?.routines.map((r) => r.id)).toEqual(['r1'])
    expect(groups[0]?.tasks).toEqual([])
    expect(groups[1]?.routines).toEqual([])
  })
  it('今日のない期間でも空の今日は作らない', () => {
    expect(buildDayGroups('2026-12-12', '2027-01-11', today, [], [t('r', '2026-12-20')])).toEqual([])
  })
  it('過去の日はルーティーンだけでも出す', () => {
    const groups = buildDayGroups('2026-11-09', '2026-11-11', today, [], [t('r', '2026-11-10')])
    expect(groups.map((g) => g.date)).toEqual(['2026-11-10'])
  })
})
