// RLS の結合テスト：ローカルの Supabase（`npx supabase start`）に対して実行する。
//   cd web && npm run test:rls
// 2人のユーザーを作り、ユーザーBがユーザーAのデータを閲覧・追加・更新・削除できないことを確認する。
// 管理用キーはローカル開発環境の既定値を `supabase status` から読む（本番の鍵は使わない）。
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function localEnv(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8' })
  const env: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2]
  }
  return env
}

const env = localEnv()
const URL_ = env.API_URL ?? ''
const ANON = env.ANON_KEY ?? ''
const SERVICE = env.SERVICE_ROLE_KEY ?? ''
if (!URL_.startsWith('http://127.0.0.1') && !URL_.startsWith('http://localhost')) {
  throw new Error('RLS テストはローカルの Supabase に対してのみ実行する')
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const stamp = Date.now()
const users = {
  a: { email: `rls-a-${stamp}@example.com`, password: 'password-a-123', id: '' },
  b: { email: `rls-b-${stamp}@example.com`, password: 'password-b-123', id: '' },
}
let A: SupabaseClient
let B: SupabaseClient
let anon: SupabaseClient
const ids = { task: '', routine: '', log: '', attachment: '', path: '' }

async function signIn(u: { email: string; password: string }) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword(u)
  if (error) throw error
  return c
}

beforeAll(async () => {
  for (const u of Object.values(users)) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true })
    if (error) throw error
    u.id = data.user.id
  }
  A = await signIn(users.a)
  B = await signIn(users.b)
  anon = createClient(URL_, ANON, { auth: { persistSession: false } })

  // ユーザーAのデータを作る
  const t = await A.from('tasks').insert({ title: 'Aのタスク', date: '2026-11-10' }).select().single()
  if (t.error) throw t.error
  ids.task = t.data.id
  const r = await A.from('routines').insert({ title: 'Aのルーティーン', rule_type: 'daily', start_date: '2026-11-01' }).select().single()
  if (r.error) throw r.error
  ids.routine = r.data.id
  const l = await A.from('routine_logs').insert({ routine_id: ids.routine, date: '2026-11-10', done: true }).select().single()
  if (l.error) throw l.error
  ids.log = l.data.id
  ids.path = `${users.a.id}/${crypto.randomUUID()}.jpg`
  const up = await A.storage.from('attachments').upload(ids.path, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const at = await A.from('attachments').insert({ task_id: ids.task, storage_path: ids.path }).select().single()
  if (at.error) throw at.error
  ids.attachment = at.data.id
}, 30_000)

afterAll(async () => {
  await admin.storage.from('attachments').remove([ids.path])
  for (const u of Object.values(users)) if (u.id) await admin.auth.admin.deleteUser(u.id)
})

const TABLES = ['tasks', 'routines', 'routine_logs', 'attachments'] as const

describe('RLS：本人は自分のデータを読める', () => {
  it.each(TABLES)('%s', async (table) => {
    const { data, error } = await A.from(table).select('id')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })
})

describe('RLS：別ユーザーは読めない', () => {
  it.each(TABLES)('%s は0件', async (table) => {
    const { data, error } = await B.from(table).select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('id を指定しても読めない', async () => {
    const { data } = await B.from('tasks').select('*').eq('id', ids.task)
    expect(data).toEqual([])
  })

  it('Storage の画像を読めない・署名付きURLを作れない', async () => {
    const dl = await B.storage.from('attachments').download(ids.path)
    expect(dl.data).toBeNull()
    const signed = await B.storage.from('attachments').createSignedUrl(ids.path, 60)
    expect(signed.data).toBeNull()
  })
})

describe('RLS：別ユーザーは更新・削除できない', () => {
  it('tasks の更新は0件', async () => {
    const { data } = await B.from('tasks').update({ title: '改ざん' }).eq('id', ids.task).select()
    expect(data).toEqual([])
    const check = await A.from('tasks').select('title').eq('id', ids.task).single()
    expect(check.data?.title).toBe('Aのタスク')
  })

  it('tasks の削除は0件', async () => {
    await B.from('tasks').delete().eq('id', ids.task)
    const check = await A.from('tasks').select('id').eq('id', ids.task)
    expect(check.data).toHaveLength(1)
  })

  it('routines / routine_logs の更新・削除は効かない', async () => {
    await B.from('routines').update({ title: '改ざん' }).eq('id', ids.routine)
    await B.from('routine_logs').update({ done: false }).eq('id', ids.log)
    await B.from('routines').delete().eq('id', ids.routine)
    const r = await A.from('routines').select('title').eq('id', ids.routine).single()
    const l = await A.from('routine_logs').select('done').eq('id', ids.log).single()
    expect(r.data?.title).toBe('Aのルーティーン')
    expect(l.data?.done).toBe(true)
  })

  it('attachments と Storage の削除は効かない', async () => {
    await B.from('attachments').delete().eq('id', ids.attachment)
    await B.storage.from('attachments').remove([ids.path])
    const a = await A.from('attachments').select('id').eq('id', ids.attachment)
    expect(a.data).toHaveLength(1)
    const dl = await A.storage.from('attachments').download(ids.path)
    expect(dl.error).toBeNull()
  })
})

describe('RLS：別ユーザー名義・他人の親への追加はできない', () => {
  it('user_id を偽って tasks に追加できない', async () => {
    const { error } = await B.from('tasks').insert({ title: 'なりすまし', date: '2026-11-10', user_id: users.a.id })
    expect(error).not.toBeNull()
  })

  it('他人のルーティーンに記録を追加できない', async () => {
    const { error } = await B.from('routine_logs').insert({ routine_id: ids.routine, date: '2026-11-11', done: true })
    expect(error).not.toBeNull()
  })

  it('他人のタスクに添付を追加できない', async () => {
    const { error } = await B.from('attachments').insert({ task_id: ids.task, storage_path: `${users.b.id}/x.jpg` })
    expect(error).not.toBeNull()
  })

  it('他人のフォルダに Storage へアップロードできない', async () => {
    const { error } = await B.storage
      .from('attachments')
      .upload(`${users.a.id}/evil.jpg`, new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    expect(error).not.toBeNull()
  })

  it('自分の添付でも、Storage パスが他人のフォルダなら登録できない', async () => {
    const own = await B.from('tasks').insert({ title: 'Bのタスク', date: '2026-11-10' }).select().single()
    expect(own.error).toBeNull()
    const { error } = await B.from('attachments').insert({ task_id: own.data?.id, storage_path: `${users.a.id}/x.jpg` })
    expect(error).not.toBeNull()
  })
})

describe('未ログイン（anon）は何もできない', () => {
  it.each(TABLES)('%s を読めない', async (table) => {
    const { data } = await anon.from(table).select('*')
    expect(data ?? []).toEqual([])
  })

  it('tasks に追加できない', async () => {
    const { error } = await anon.from('tasks').insert({ title: 'anon', date: '2026-11-10', user_id: users.a.id })
    expect(error).not.toBeNull()
  })

  it('api_tokens のハッシュはログインユーザーでも読めない', async () => {
    const { error } = await A.from('api_tokens').select('token_hash')
    expect(error).not.toBeNull()
  })
})

describe('締め切り（SPEC §3.7）', () => {
  it('日付より前の締め切りは DB で拒否される', async () => {
    const { error } = await A.from('tasks').insert({ title: '逆転', date: '2026-11-10', due_date: '2026-11-09' })
    expect(error).not.toBeNull()
  })

  it('同じ日・後の締め切りは登録できる', async () => {
    const { error } = await A.from('tasks').insert({ title: '期間', date: '2026-11-10', due_date: '2026-11-10' })
    expect(error).toBeNull()
  })

  it('別ユーザーの締め切りは変更できない', async () => {
    const { data } = await B.from('tasks').update({ due_date: '2026-12-31' }).eq('id', ids.task).select()
    expect(data ?? []).toEqual([])
  })
})
