import { describe, expect, it } from 'vitest'
import { endDateForStop, isEnded, normalizeRuleDays, planRoutineSave, summarizeRule, type RoutineDraft } from './routineRule'
import type { Routine } from './types'

const base: Routine = {
  id: 'r1',
  user_id: 'u',
  title: '筋トレ',
  memo: '',
  rule_type: 'weekly',
  rule_days: [1, 3, 5],
  start_date: '2026-11-01',
  end_date: null,
  remind_time: null,
  sort_order: 0,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}
const draftOf = (r: Routine, p: Partial<RoutineDraft> = {}): RoutineDraft => ({
  title: r.title,
  memo: r.memo,
  rule_type: r.rule_type,
  rule_days: r.rule_days,
  start_date: r.start_date,
  end_date: r.end_date,
  remind_time: r.remind_time,
  ...p,
})

describe('summarizeRule', () => {
  it('要約', () => {
    expect(summarizeRule({ rule_type: 'weekly', rule_days: [5, 1, 3] })).toBe('毎週 月・水・金')
    expect(summarizeRule({ rule_type: 'weekly', rule_days: [0, 6] })).toBe('毎週 土・日')
    expect(summarizeRule({ rule_type: 'monthly', rule_days: [15, 1] })).toBe('毎月 1日・15日')
    expect(summarizeRule({ rule_type: 'daily', rule_days: null })).toBe('毎日')
    expect(summarizeRule({ rule_type: 'weekdays', rule_days: null })).toBe('平日（月〜金）')
  })
})

describe('normalizeRuleDays', () => {
  it('重複と範囲外を除いて並べる', () => {
    expect(normalizeRuleDays('weekly', [3, 1, 3, 7, -1])).toEqual([1, 3])
    expect(normalizeRuleDays('monthly', [31, 0, 1, 32])).toEqual([1, 31])
    expect(normalizeRuleDays('daily', [1])).toBeNull()
  })
})

describe('planRoutineSave', () => {
  const today = '2026-11-10'
  it('タイトル・メモ・通知時刻だけの変更はそのまま更新', () => {
    const plan = planRoutineSave(base, draftOf(base, { title: 'ストレッチ', memo: 'x', remind_time: '07:00' }), today)
    expect(plan.kind).toBe('update')
  })
  it('ルール種別の変更は昨日で終了＋今日開始で分割', () => {
    const plan = planRoutineSave(base, draftOf(base, { rule_type: 'daily', rule_days: null }), today)
    expect(plan).toEqual({
      kind: 'split',
      endOldAt: '2026-11-09',
      create: draftOf(base, { rule_type: 'daily', rule_days: null, start_date: '2026-11-10' }),
      moveLogsFrom: '2026-11-10',
    })
  })
  it('曜日の変更も分割', () => {
    expect(planRoutineSave(base, draftOf(base, { rule_days: [2] }), today).kind).toBe('split')
  })
  it('曜日の並びだけ違うのは変更ではない', () => {
    expect(planRoutineSave(base, draftOf(base, { rule_days: [1, 3, 5] }), today).kind).toBe('update')
  })
  it('開始日の変更も分割。未来の開始日を指定したらその日から', () => {
    const plan = planRoutineSave(base, draftOf(base, { start_date: '2026-11-20' }), today)
    expect(plan.kind === 'split' && plan.create.start_date).toBe('2026-11-20')
  })
  it('まだ始まっていない（開始日が今日以降）ルーティーンはそのまま更新', () => {
    const future = { ...base, start_date: '2026-11-10' }
    expect(planRoutineSave(future, draftOf(future, { rule_type: 'daily', rule_days: null }), today).kind).toBe('update')
  })
})

describe('終了', () => {
  it('今日以降を終了：end_date は昨日', () => {
    expect(endDateForStop(base, '2026-11-10')).toBe('2026-11-09')
  })
  it('開始前のルーティーンは開始日の前日', () => {
    expect(endDateForStop({ start_date: '2026-11-20' }, '2026-11-10')).toBe('2026-11-19')
  })
  it('isEnded', () => {
    expect(isEnded({ end_date: '2026-11-09' }, '2026-11-10')).toBe(true)
    expect(isEnded({ end_date: '2026-11-10' }, '2026-11-10')).toBe(false)
    expect(isEnded({ end_date: null }, '2026-11-10')).toBe(false)
  })
})
