// JST前提の日付ユーティリティ。
// 日付は常に 'YYYY-MM-DD' 文字列で扱い、ローカルタイムゾーンの Date 変換を挟まない。
// 内部の計算は UTC の暦として行う（タイムゾーンのずれが入らない）。

export type DateStr = string // 'YYYY-MM-DD'

const TZ = 'Asia/Tokyo'
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateStr(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

export function parse(s: DateStr): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(s)
  if (!m) throw new Error(`Invalid date string: ${s}`)
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

export function format(y: number, m: number, d: number): DateStr {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toUtcMs(s: DateStr): number {
  const { y, m, d } = parse(s)
  return Date.UTC(y, m - 1, d)
}

function fromUtcMs(ms: number): DateStr {
  const dt = new Date(ms)
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** 現在の JST の日付 */
export function todayJst(now: Date = new Date()): DateStr {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(s: DateStr, n: number): DateStr {
  return fromUtcMs(toUtcMs(s) + n * 86_400_000)
}

/** 月を加算する。存在しない日は月末に丸める（1/31 + 1か月 = 2/28 or 2/29） */
export function addMonths(s: DateStr, n: number): DateStr {
  const { y, m, d } = parse(s)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return format(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** 0=日〜6=土 */
export function dayOfWeek(s: DateStr): number {
  return new Date(toUtcMs(s)).getUTCDay()
}

/** a < b なら負、a = b なら 0、a > b なら正（日数差 b - a ではなく比較用） */
export function compare(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function diffDays(from: DateStr, to: DateStr): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000)
}

/** from から to まで（両端を含む）の日付の配列 */
export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** 「M月D日(曜)」 */
export function formatDayLabel(s: DateStr): string {
  const { m, d } = parse(s)
  return `${m}月${d}日(${WEEKDAYS_JA[dayOfWeek(s)]})`
}

/** 「YYYY年M月D日」 */
export function formatLongDate(s: DateStr): string {
  const { y, m, d } = parse(s)
  return `${y}年${m}月${d}日`
}

/** 期間の表示。同じ年なら終わりの年は省く（例：2026年11月11日〜12月10日） */
export function formatPeriod(from: DateStr, to: DateStr): string {
  const a = parse(from)
  const b = parse(to)
  return `${a.y}年${a.m}月${a.d}日〜${b.y === a.y ? '' : `${b.y}年`}${b.m}月${b.d}日`
}

export function weekdayLabel(dow: number): string {
  return WEEKDAYS_JA[dow] ?? ''
}

/** 表示期間：start から1か月（終端は1か月後の前日） */
export function periodFrom(start: DateStr): { from: DateStr; to: DateStr } {
  return { from: start, to: addDays(addMonths(start, 1), -1) }
}

// ---------------------------------------------------------------------------
// 日時（timestamptz）⇔ JST の <input type="datetime-local"> 値
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DDTHH:mm'（JST）→ ISO 文字列（+09:00） */
export function jstLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  return `${local}:00+09:00`
}

/** ISO（timestamptz）→ 'YYYY-MM-DDTHH:mm'（JST） */
export function isoToJstLocal(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  // JST は夏時間がないので +9 時間固定でよい
  const dt = new Date(ms + 9 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}T${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`
}
