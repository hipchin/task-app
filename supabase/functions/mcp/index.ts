// AI秘書の接続口（リモート MCP サーバー）。SPEC Phase 3。
// ChatGPT などの MCP クライアントが OAuth 2.1（Supabase Auth）でログインしたユーザーとして呼ぶ。
// すべての処理はそのユーザーのトークンで行い、RLS が効く（OAuth クライアントに許さない操作は DB 側で拒否する）。
import { pipeline } from '@supabase/middleware'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import type { Database } from './database.types.ts'
import { addDays, diffDays, isDateStr, todayJst, weekdayLabel, dayOfWeek, type DateStr } from '../../../web/src/lib/date.ts'
import { expandRoutines, routineMatches } from '../../../web/src/lib/expandRoutines.ts'
import { isEnded, summarizeRule } from '../../../web/src/lib/routineRule.ts'
import { openTaskNote, sortOpenTasks } from '../../../web/src/lib/openTasks.ts'
import type { Routine, RoutineLog } from '../../../web/src/lib/types.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'

type Db = SupabaseClient<Database>

const MAX_RANGE_DAYS = 62
const MEMO_PREVIEW = 500
const OPEN_LIMIT = 300

const dateSchema = z.string().refine(isDateStr, 'YYYY-MM-DD 形式の日付を指定してください')
const idSchema = z.string().uuid()

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function clip(s: string, n = MEMO_PREVIEW) {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

// 操作記録（agent_actions）は DB のトリガーが変更と同じトランザクションで作る（20261111020000_mcp_hardening.sql）

const READ = { readOnlyHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

function buildServer(db: Db) {
  const server = new McpServer({ name: 'yarukoto-tasks', version: '1.0.0' })

  server.registerTool(
    'list_tasks',
    {
      title: '期間のタスクとルーティーン',
      description:
        '指定した期間（最大62日）の日ごとのタスクとルーティーンを返す。日付は日本時間の YYYY-MM-DD。省略時は今日から7日間。',
      inputSchema: z.object({ from: dateSchema.optional(), to: dateSchema.optional() }),
      annotations: READ,
    },
    async ({ from, to }) => {
      const today = todayJst()
      const f = from ?? today
      const t = to ?? addDays(f, 6)
      if (t < f) return fail('to は from 以降の日付にしてください。')
      if (diffDays(f, t) + 1 > MAX_RANGE_DAYS) return fail(`期間は最大${MAX_RANGE_DAYS}日です。`)
      const [tasks, routines, logs] = await Promise.all([
        db.from('tasks').select('id, title, memo, date, due_date, done').gte('date', f).lte('date', t).order('date').order('sort_order'),
        db.from('routines').select('*'),
        db.from('routine_logs').select('*').gte('date', f).lte('date', t),
      ])
      const err = tasks.error ?? routines.error ?? logs.error
      if (err) return fail(err.message)
      const occ = expandRoutines((routines.data ?? []) as Routine[], (logs.data ?? []) as RoutineLog[], f, t)
      const days: Record<string, { date: string; weekday: string; routines: unknown[]; tasks: unknown[] }> = {}
      const day = (d: DateStr) => (days[d] ??= { date: d, weekday: weekdayLabel(dayOfWeek(d)), routines: [], tasks: [] })
      for (const o of occ) day(o.date).routines.push({ routine_id: o.routine.id, title: o.routine.title, done: o.done })
      for (const x of tasks.data ?? []) {
        day(x.date).tasks.push({ id: x.id, title: x.title, done: x.done, due_date: x.due_date, memo: clip(x.memo) })
      }
      return ok({ today, from: f, to: t, days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)) })
    },
  )

  server.registerTool(
    'list_open_tasks',
    {
      title: '対応中のタスク',
      description: '日付を過ぎてもまだ完了していないタスク（対応中）を、締め切りの近い順に返す。ルーティーンは含まない。',
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      const today = todayJst()
      const { data, error } = await db
        .from('tasks')
        .select('id, title, memo, date, due_date, done, sort_order, created_at')
        .eq('done', false)
        .lt('date', today)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('date')
        .limit(OPEN_LIMIT + 1)
      if (error) return fail(error.message)
      const truncated = (data ?? []).length > OPEN_LIMIT
      const list = sortOpenTasks((data ?? []).slice(0, OPEN_LIMIT)).map((x) => ({
        id: x.id,
        title: x.title,
        since: x.date,
        due_date: x.due_date,
        status: openTaskNote(x, today).text,
        memo: clip(x.memo),
      }))
      return ok({ today, open_tasks: list, ...(truncated ? { truncated: true, note: `${OPEN_LIMIT}件を超えています。締め切りの近いものから${OPEN_LIMIT}件だけ返しました。` } : {}) })
    },
  )

  server.registerTool(
    'list_routines',
    {
      title: 'ルーティーン一覧',
      description: '登録されているルーティーン（繰り返しの予定）とルールを返す。',
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      const today = todayJst()
      const { data, error } = await db.from('routines').select('*').order('sort_order')
      if (error) return fail(error.message)
      return ok(
        ((data ?? []) as Routine[]).map((r) => ({
          routine_id: r.id,
          title: r.title,
          rule: summarizeRule(r),
          start_date: r.start_date,
          end_date: r.end_date,
          active: !isEnded(r, today),
          memo: clip(r.memo),
        })),
      )
    },
  )

  server.registerTool(
    'add_task',
    {
      title: 'タスクを追加',
      description: 'タスクを追加する。date を省略すると今日。何日もかかるものは date を開始日、due_date を締め切りにする。',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(500),
        date: dateSchema.optional(),
        due_date: dateSchema.optional(),
        memo: z.string().max(20000).optional(),
      }),
      annotations: WRITE,
    },
    async ({ title, date, due_date, memo }) => {
      const d = date ?? todayJst()
      if (due_date && due_date < d) return fail('締め切りは日付と同じ日か、それより後にしてください。')
      const { data, error } = await db
        .from('tasks')
        .insert({ title, date: d, due_date: due_date ?? null, memo: memo ?? '', sort_order: Date.now() })
        .select('id, title, date, due_date')
        .single()
      if (error) return fail(error.message)
      return ok({ added: data })
    },
  )

  server.registerTool(
    'set_task_done',
    {
      title: 'タスクを完了／未完了にする',
      description: 'タスクの完了状態を変える。',
      inputSchema: z.object({ id: idSchema, done: z.boolean() }),
      annotations: WRITE,
    },
    async ({ id, done }) => {
      const { data, error } = await db
        .from('tasks')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
        .select('id, title, done')
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('タスクが見つかりません。')
      return ok({ updated: data })
    },
  )

  server.registerTool(
    'update_task',
    {
      title: 'タスクを変更',
      description: 'タスクのタイトル・日付・締め切りを変える。due_date に null を渡すと締め切りを外す。メモは append_task_memo を使う。',
      inputSchema: z.object({
        id: idSchema,
        title: z.string().trim().min(1).max(500).optional(),
        date: dateSchema.optional(),
        due_date: dateSchema.nullable().optional(),
      }),
      annotations: WRITE,
    },
    async ({ id, title, date, due_date }) => {
      const { data: cur, error: e1 } = await db.from('tasks').select('id, title, date, due_date').eq('id', id).maybeSingle()
      if (e1) return fail(e1.message)
      if (!cur) return fail('タスクが見つかりません。')
      const patch: Database['public']['Tables']['tasks']['Update'] = {}
      if (title !== undefined) patch.title = title
      if (date !== undefined) patch.date = date
      if (due_date !== undefined) patch.due_date = due_date
      if (Object.keys(patch).length === 0) return fail('変更する項目を指定してください。')
      const nextDate = patch.date ?? cur.date
      const nextDue = patch.due_date === undefined ? cur.due_date : patch.due_date
      if (nextDue && nextDue < nextDate) return fail('締め切りは日付と同じ日か、それより後にしてください。')
      const { data, error } = await db.from('tasks').update(patch).eq('id', id).select('id, title, date, due_date').single()
      if (error) return fail(error.message)
      return ok({ updated: data })
    },
  )

  server.registerTool(
    'append_task_memo',
    {
      title: 'タスクのメモに追記',
      description: 'タスクのメモの末尾に追記する（既存のメモは消さない）。調べた結果や進み具合を残すのに使う。',
      inputSchema: z.object({ id: idSchema, text: z.string().trim().min(1).max(5000) }),
      annotations: WRITE,
    },
    async ({ id, text }) => {
      const stamp = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')
      // DB の関数で1回の UPDATE として追記する（同時に追記しても消えない）
      const { data, error } = await db.rpc('append_task_memo', { p_task_id: id, p_text: `[${stamp} AI] ${text}` })
      if (error) return fail(/check|20000/i.test(error.message) ? 'メモが長すぎます（2万字まで）。' : error.message)
      if (!data || (Array.isArray(data) && data.length === 0)) return fail('タスクが見つかりません。')
      return ok({ appended: true })
    },
  )

  server.registerTool(
    'set_routine_done',
    {
      title: 'ルーティーンを完了／未完了にする',
      description: '指定した日のルーティーンの完了状態を変える。その日が対象日でなければエラー。',
      inputSchema: z.object({ routine_id: idSchema, date: dateSchema, done: z.boolean() }),
      annotations: WRITE,
    },
    async ({ routine_id, date, done }) => {
      const { data: r, error: e1 } = await db.from('routines').select('*').eq('id', routine_id).maybeSingle()
      if (e1) return fail(e1.message)
      if (!r) return fail('ルーティーンが見つかりません。')
      if (!routineMatches(r as Routine, date)) return fail(`${date} はこのルーティーンの対象日ではありません。`)
      const { error } = await db
        .from('routine_logs')
        .upsert({ routine_id, date, done }, { onConflict: 'routine_id,date' })
      if (error) return fail(error.message)
      return ok({ routine_id, date, done })
    },
  )

  return server
}

Deno.serve(
  pipeline([withOAuthProtectedResource(), withSupabase<Database>({ auth: 'user' })], async (req, { supabase }) => {
    // JWT の署名と期限だけでは「連携を解除」した後も最大1時間使えてしまうので、セッションが生きているかを Auth に確認する
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { error: authError } = await supabase.auth.getUser(token)
    if (authError) {
      return Response.json({ error: 'invalid_token', error_description: 'セッションが無効です。もう一度接続してください。' }, { status: 401 })
    }
    const handler = createMcpHandler(() => buildServer(supabase as unknown as Db), {
      onerror: (error) => console.error('MCP request failed', error),
    })
    return handler.fetch(req)
  }),
)
