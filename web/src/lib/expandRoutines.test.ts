import { describe, expect, it } from 'vitest'
import { expandRoutines, routineMatches } from './expandRoutines'
import type { Routine, RoutineLog } from './types'

let seq = 0
function routine(p: Partial<Routine>): Routine {
  seq += 1
  return {
    id: p.id ?? `r${seq}`,
    user_id: 'u',
    title: p.title ?? `routine ${seq}`,
    memo: '',
    rule_type: 'daily',
    rule_days: null,
    start_date: '2026-01-01',
    end_date: null,
    remind_time: null,
    sort_order: 0,
    created_at: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}Z`,
    updated_at: '2026-01-01T00:00:00Z',
    ...p,
  }
}
function log(routine_id: string, date: string, done: boolean): RoutineLog {
  return { id: `${routine_id}-${date}`, user_id: 'u', routine_id, date, done, memo: '', notified_at: null }
}
const dates = (rs: { date: string }[]) => rs.map((r) => r.date)

describe('expandRoutines: ルール種別', () => {
  it('daily は毎日', () => {
    const r = routine({ rule_type: 'daily' })
    expect(dates(expandRoutines([r], [], '2026-11-10', '2026-11-13'))).toEqual([
      '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
    ])
  })

  it('weekly は指定曜日だけ（月・水・金）', () => {
    const r = routine({ rule_type: 'weekly', rule_days: [1, 3, 5] })
    // 2026-11-09(月) 〜 2026-11-15(日)
    expect(dates(expandRoutines([r], [], '2026-11-09', '2026-11-15'))).toEqual([
      '2026-11-09', '2026-11-11', '2026-11-13',
    ])
  })

  it('weekly で日曜(0)と土曜(6)', () => {
    const r = routine({ rule_type: 'weekly', rule_days: [0, 6] })
    expect(dates(expandRoutines([r], [], '2026-11-09', '2026-11-15'))).toEqual(['2026-11-14', '2026-11-15'])
  })

  it('weekdays は月〜金（祝日は考慮しない）', () => {
    const r = routine({ rule_type: 'weekdays' })
    // 2026-11-23(月) は勤労感謝の日だが v1 では表示する（TODO-2）
    expect(dates(expandRoutines([r], [], '2026-11-21', '2026-11-29'))).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    ])
  })

  it('monthly は指定日', () => {
    const r = routine({ rule_type: 'monthly', rule_days: [1, 15] })
    expect(dates(expandRoutines([r], [], '2026-11-01', '2026-12-31'))).toEqual([
      '2026-11-01', '2026-11-15', '2026-12-01', '2026-12-15',
    ])
  })

  it('rule_days が null や空なら weekly/monthly は表示しない', () => {
    const a = routine({ rule_type: 'weekly', rule_days: null })
    const b = routine({ rule_type: 'monthly', rule_days: [] })
    expect(expandRoutines([a, b], [], '2026-11-01', '2026-11-30')).toEqual([])
  })
})

describe('expandRoutines: 月末', () => {
  it('31日指定は31日がない月をスキップする（TODO-3）', () => {
    const r = routine({ rule_type: 'monthly', rule_days: [31] })
    expect(dates(expandRoutines([r], [], '2026-01-01', '2026-07-31'))).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31',
    ])
  })

  it('30日指定は2月だけスキップする', () => {
    const r = routine({ rule_type: 'monthly', rule_days: [30] })
    expect(dates(expandRoutines([r], [], '2026-01-01', '2026-03-31'))).toEqual(['2026-01-30', '2026-03-30'])
  })

  it('月末をまたぐ期間でも重複・欠落がない', () => {
    const r = routine({ rule_type: 'daily' })
    expect(dates(expandRoutines([r], [], '2026-01-30', '2026-02-02'))).toEqual([
      '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
    ])
  })

  it('年末をまたぐ', () => {
    const r = routine({ rule_type: 'monthly', rule_days: [31, 1] })
    expect(dates(expandRoutines([r], [], '2026-12-30', '2027-01-02'))).toEqual(['2026-12-31', '2027-01-01'])
  })
})

describe('expandRoutines: うるう年', () => {
  it('29日指定はうるう年の2月だけ表示される', () => {
    const r = routine({ rule_type: 'monthly', rule_days: [29] })
    expect(dates(expandRoutines([r], [], '2027-02-01', '2027-03-01'))).toEqual([])
    expect(dates(expandRoutines([r], [], '2028-02-01', '2028-03-01'))).toEqual(['2028-02-29'])
  })

  it('うるう年の 2/28 → 2/29 → 3/1 を毎日展開する', () => {
    const r = routine({ rule_type: 'daily' })
    expect(dates(expandRoutines([r], [], '2028-02-28', '2028-03-01'))).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01',
    ])
  })

  it('平年は 2/28 の次が 3/1', () => {
    const r = routine({ rule_type: 'daily' })
    expect(dates(expandRoutines([r], [], '2027-02-28', '2027-03-01'))).toEqual(['2027-02-28', '2027-03-01'])
  })

  it('2100年はうるう年ではない', () => {
    const r = routine({ rule_type: 'monthly', rule_days: [29] })
    expect(dates(expandRoutines([r], [], '2100-02-01', '2100-02-28'))).toEqual([])
  })
})

describe('expandRoutines: 開始日・終了日の境界', () => {
  it('開始日当日から表示し、前日は表示しない', () => {
    const r = routine({ start_date: '2026-11-12' })
    expect(dates(expandRoutines([r], [], '2026-11-10', '2026-11-13'))).toEqual(['2026-11-12', '2026-11-13'])
  })

  it('終了日当日まで表示し、翌日は表示しない', () => {
    const r = routine({ end_date: '2026-11-11' })
    expect(dates(expandRoutines([r], [], '2026-11-10', '2026-11-13'))).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('開始日 = 終了日 なら1日だけ', () => {
    const r = routine({ start_date: '2026-11-11', end_date: '2026-11-11' })
    expect(dates(expandRoutines([r], [], '2026-11-01', '2026-11-30'))).toEqual(['2026-11-11'])
  })

  it('終了日 = 開始日の前日（開始前に終了）なら表示しない', () => {
    const r = routine({ start_date: '2026-11-11', end_date: '2026-11-10' })
    expect(expandRoutines([r], [], '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('期間の外にある開始日・終了日', () => {
    const before = routine({ start_date: '2026-01-01', end_date: '2026-10-31' })
    const after = routine({ start_date: '2026-12-01' })
    expect(expandRoutines([before, after], [], '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('from = to の1日だけの期間', () => {
    const r = routine({})
    expect(dates(expandRoutines([r], [], '2026-11-10', '2026-11-10'))).toEqual(['2026-11-10'])
  })

  it('from > to なら空', () => {
    expect(expandRoutines([routine({})], [], '2026-11-11', '2026-11-10')).toEqual([])
  })

  it('weekly の開始日が該当曜日でない場合、次の該当曜日から', () => {
    // 2026-11-10(火) 開始、毎週月曜
    const r = routine({ rule_type: 'weekly', rule_days: [1], start_date: '2026-11-10' })
    expect(dates(expandRoutines([r], [], '2026-11-09', '2026-11-23'))).toEqual(['2026-11-16', '2026-11-23'])
  })
})

describe('expandRoutines: 完了状態', () => {
  it('ログがなければ未完了、ログがあればその done', () => {
    const r = routine({ id: 'x' })
    const res = expandRoutines([r], [log('x', '2026-11-11', true), log('x', '2026-11-12', false)], '2026-11-10', '2026-11-12')
    expect(res.map((o) => [o.date, o.done])).toEqual([
      ['2026-11-10', false],
      ['2026-11-11', true],
      ['2026-11-12', false],
    ])
    expect(res[0]?.log).toBeNull()
    expect(res[1]?.log?.id).toBe('x-2026-11-11')
  })

  it('日ごとに完了状態が独立し、昨日の未完了は今日に繰り越されない', () => {
    const r = routine({ id: 'y' })
    // 昨日(11/09)は未完了のまま。今日(11/10)だけ完了
    const res = expandRoutines([r], [log('y', '2026-11-10', true)], '2026-11-09', '2026-11-10')
    expect(res).toHaveLength(2) // 各日1件ずつ。繰り越しで今日に2件にならない
    expect(res.map((o) => [o.date, o.done])).toEqual([
      ['2026-11-09', false],
      ['2026-11-10', true],
    ])
  })

  it('別のルーティーンのログは混ざらない', () => {
    const a = routine({ id: 'a' })
    const b = routine({ id: 'b' })
    const res = expandRoutines([a, b], [log('a', '2026-11-10', true)], '2026-11-10', '2026-11-10')
    expect(res.map((o) => [o.routine.id, o.done])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('ルール変更で分割したとき、旧ルーティーンの過去の完了履歴は保たれる', () => {
    const old = routine({ id: 'old', rule_type: 'daily', start_date: '2026-11-01', end_date: '2026-11-09' })
    const neu = routine({ id: 'new', rule_type: 'weekly', rule_days: [2], start_date: '2026-11-10' })
    const logs = [log('old', '2026-11-08', true), log('old', '2026-11-09', true), log('new', '2026-11-10', true)]
    const res = expandRoutines([old, neu], logs, '2026-11-08', '2026-11-17')
    expect(res.map((o) => [o.routine.id, o.date, o.done])).toEqual([
      ['old', '2026-11-08', true],
      ['old', '2026-11-09', true],
      ['new', '2026-11-10', true],
      ['new', '2026-11-17', false],
    ])
  })
})

describe('expandRoutines: 並び順', () => {
  it('同じ日の中では sort_order 順', () => {
    const a = routine({ id: 'a', sort_order: 2 })
    const b = routine({ id: 'b', sort_order: 1 })
    const res = expandRoutines([a, b], [], '2026-11-10', '2026-11-11')
    expect(res.map((o) => `${o.date}:${o.routine.id}`)).toEqual([
      '2026-11-10:b', '2026-11-10:a', '2026-11-11:b', '2026-11-11:a',
    ])
  })
})

describe('routineMatches', () => {
  it('weekly に範囲外の値が入っていても誤作動しない', () => {
    expect(routineMatches({ rule_type: 'weekly', rule_days: [7], start_date: '2026-01-01', end_date: null }, '2026-11-08')).toBe(false)
  })
})
