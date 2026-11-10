import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  dayOfWeek,
  daysInMonth,
  diffDays,
  eachDay,
  formatDayLabel,
  formatLongDate,
  isDateStr,
  isLeapYear,
  isoToJstLocal,
  jstLocalToIso,
  periodFrom,
  todayJst,
} from './date'

describe('todayJst', () => {
  it('UTC 15:00 以降は JST では翌日になる', () => {
    expect(todayJst(new Date('2026-11-09T14:59:59Z'))).toBe('2026-11-09')
    expect(todayJst(new Date('2026-11-09T15:00:00Z'))).toBe('2026-11-10')
  })
  it('年越し', () => {
    expect(todayJst(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01')
  })
})

describe('addDays', () => {
  it('月末・年末をまたぐ', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
  it('大きな日数', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01')
    expect(addDays('2028-01-01', 366)).toBe('2029-01-01')
  })
})

describe('addMonths', () => {
  it('存在しない日は月末に丸める', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
  })
  it('年をまたぐ', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15')
  })
})

describe('daysInMonth / isLeapYear', () => {
  it('うるう年', () => {
    expect(isLeapYear(2028)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('isDateStr', () => {
  it('形式と実在を確認する', () => {
    expect(isDateStr('2026-02-28')).toBe(true)
    expect(isDateStr('2026-02-29')).toBe(false)
    expect(isDateStr('2028-02-29')).toBe(true)
    expect(isDateStr('2026-13-01')).toBe(false)
    expect(isDateStr('2026-1-01')).toBe(false)
  })
})

describe('dayOfWeek / ラベル', () => {
  it('曜日', () => {
    expect(dayOfWeek('2026-11-10')).toBe(2) // 火
    expect(dayOfWeek('2026-11-08')).toBe(0) // 日
    expect(dayOfWeek('2026-11-14')).toBe(6) // 土
  })
  it('M月D日(曜)', () => {
    expect(formatDayLabel('2026-11-10')).toBe('11月10日(火)')
    expect(formatDayLabel('2027-01-01')).toBe('1月1日(金)')
  })
  it('YYYY年M月D日', () => {
    expect(formatLongDate('2026-01-05')).toBe('2026年1月5日')
  })
})

describe('期間', () => {
  it('今日から1か月', () => {
    expect(periodFrom('2026-11-10')).toEqual({ from: '2026-11-10', to: '2026-12-09' })
    expect(periodFrom('2026-01-31')).toEqual({ from: '2026-01-31', to: '2026-02-27' })
  })
  it('eachDay は両端を含む', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    expect(eachDay('2026-03-02', '2026-03-01')).toEqual([])
  })
  it('diffDays', () => {
    expect(diffDays('2026-11-10', '2026-12-10')).toBe(30)
  })
})

describe('JST 日時の変換', () => {
  it('datetime-local → ISO → datetime-local で往復する', () => {
    const iso = jstLocalToIso('2026-11-10T09:30')
    expect(iso).toBe('2026-11-10T09:30:00+09:00')
    expect(isoToJstLocal(iso ?? '')).toBe('2026-11-10T09:30')
  })
  it('UTC 表記の値も JST で表示する', () => {
    expect(isoToJstLocal('2026-11-09T15:30:00Z')).toBe('2026-11-10T00:30')
    expect(isoToJstLocal('2026-11-10T00:30:00+00:00')).toBe('2026-11-10T09:30')
  })
  it('不正な値', () => {
    expect(jstLocalToIso('')).toBeNull()
    expect(isoToJstLocal('nope')).toBe('')
  })
})
