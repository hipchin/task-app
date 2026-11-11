// AI 連携（SPEC Phase 3）：ChatGPT と同じ手順（動的クライアント登録 → 認可コード＋PKCE → MCP 呼び出し）を通しで確認する
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { credentials, localSupabase } from './env.ts'

const REDIRECT = 'http://localhost:9/callback'
const b64url = (b: Buffer) => b.toString('base64url')

function jstDate(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

async function login(page: Page) {
  const { email, password } = credentials()
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}

/** MCP の JSON-RPC を1回呼ぶ（Streamable HTTP。応答は JSON か SSE） */
async function rpc(fnUrl: string, token: string, method: string, params: unknown) {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await res.text()
  if (res.status !== 200) return { status: res.status, body: text }
  const json = text.startsWith('{') ? text : (text.split('\n').find((l) => l.startsWith('data:')) ?? '').slice(5)
  return { status: 200, body: JSON.parse(json) as { result?: { content?: { text: string }[]; isError?: boolean }; error?: unknown } }
}

async function tool(fnUrl: string, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(fnUrl, token, 'tools/call', { name, arguments: args })
  if (r.status !== 200 || typeof r.body === 'string') throw new Error(`HTTP ${r.status}: ${String(r.body)}`)
  const result = r.body.result
  const text = result?.content?.[0]?.text ?? ''
  return { isError: result?.isError === true, text, json: () => JSON.parse(text) as Record<string, unknown> }
}

test('ChatGPT と同じ手順で接続し、読み書きでき、禁止操作は拒否され、解除すると使えなくなる', async ({ page }) => {
  test.setTimeout(90_000)
  const { url, anon, service } = localSupabase()
  const fnUrl = `${url}/functions/v1/mcp`
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { id: userId } = credentials()

  // 0. 未認証は 401 と発見用のヘッダー
  const unauth = await fetch(fnUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  expect(unauth.status).toBe(401)
  expect(unauth.headers.get('www-authenticate')).toContain('oauth-protected-resource')

  // 1. 動的クライアント登録
  const clientName = `E2E GPT ${Date.now()}`
  const reg = await fetch(`${url}/auth/v1/oauth/clients/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: clientName, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }),
  })
  expect(reg.status).toBeLessThan(300)
  const client = (await reg.json()) as { client_id: string }

  // 2. 認可リクエスト → 同意画面への転送先（authorization_id）
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const authorize = new URL(`${url}/auth/v1/oauth/authorize`)
  authorize.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'openid email offline_access',
  }).toString()
  const ar = await fetch(authorize, { redirect: 'manual', headers: { apikey: anon } })
  const location = ar.headers.get('location') ?? ''
  expect(location, `authorize の転送先: ${ar.status} ${location}`).toMatch(/\/task-app\/oauth\/consent\?authorization_id=/)
  const authorizationId = new URL(location).searchParams.get('authorization_id') ?? ''

  // 3. 同意画面（ローカルのビルドで開く）：ログイン → 許可 → 接続元へ code 付きで戻る
  // Auth は同意 API の呼び出し元（Origin）を site_url（本番の GitHub Pages）と照合する。
  // ローカルのビルドから呼ぶため、テストでは Origin を本番に差し替える（本番では本物の Origin が一致する）
  await page.route(`${url}/auth/v1/**`, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.continue()
    // ブラウザは Origin を書き換えられないので、テスト側から送り直す
    const res = await route.fetch({ headers: { ...req.headers(), origin: 'https://hipchin.github.io' } })
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } })
  })
  await page.goto(`./oauth/consent?authorization_id=${authorizationId}`)
  await login(page)
  await expect(page.getByRole('heading', { name: 'アプリの連携' })).toBeVisible()
  await expect(page.getByText(clientName)).toBeVisible()
  await expect(page.getByText('タスクの削除、ルーティーン本体の変更、画像の操作はできません。', { exact: false })).toBeVisible()
  // 戻り先が ChatGPT ではない（テストでは localhost）ので警告が出て、安全な選択が先に来る
  await expect(page.getByRole('alert')).toContainText('この接続元は ChatGPT ではありません')
  await expect(page.getByRole('button', { name: '許可する', exact: true })).toHaveCount(0)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/consent.png` })
  const callback = page.waitForRequest((r) => r.url().startsWith(REDIRECT))
  await page.getByRole('button', { name: 'それでも許可する' }).click()
  const cb = new URL((await callback).url())
  expect(cb.searchParams.get('state')).toBe('xyz')
  const code = cb.searchParams.get('code') ?? ''
  expect(code).not.toBe('')

  // 4. トークン交換
  const tr = await fetch(`${url}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', apikey: anon },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      code_verifier: verifier,
    }),
  })
  expect(tr.status).toBe(200)
  const { access_token: token } = (await tr.json()) as { access_token: string }

  // 5. MCP：初期化とツール一覧
  const init = await rpc(fnUrl, token, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '1' },
  })
  expect(init.status).toBe(200)
  const list = await rpc(fnUrl, token, 'tools/list', {})
  const names = ((list.body as { result: { tools: { name: string }[] } }).result.tools ?? []).map((t) => t.name).sort()
  expect(names).toEqual(
    ['add_task', 'append_task_memo', 'list_open_tasks', 'list_routines', 'list_tasks', 'set_routine_done', 'set_task_done', 'update_task'].sort(),
  )

  // 6. 書き込み：追加・メモ追記・完了。対応中・期間の読み取り
  const title = `GPTが追加 ${Date.now()}`
  const added = await tool(fnUrl, token, 'add_task', { title, date: jstDate(1), due_date: jstDate(3) })
  expect(added.isError, added.text).toBe(false)
  const taskId = (added.json().added as { id: string }).id
  expect((await tool(fnUrl, token, 'append_task_memo', { id: taskId, text: '見積もりを比較した' })).isError).toBe(false)
  const range = await tool(fnUrl, token, 'list_tasks', { from: jstDate(0), to: jstDate(2) })
  expect(range.text).toContain(title)
  expect(range.text).toContain('見積もりを比較した')
  const bad = await tool(fnUrl, token, 'add_task', { title: 'x', date: jstDate(3), due_date: jstDate(1) })
  expect(bad.isError).toBe(true)
  const late = `GPTの対応中 ${Date.now()}`
  await admin.from('tasks').insert({ user_id: userId, title: late, date: jstDate(-3) })
  expect((await tool(fnUrl, token, 'list_open_tasks')).text).toContain(late)
  expect((await tool(fnUrl, token, 'set_task_done', { id: taskId, done: true })).isError).toBe(false)
  const { data: row } = await admin.from('tasks').select('done, memo').eq('id', taskId).single()
  expect(row?.done).toBe(true)
  expect(row?.memo).toContain('AI] 見積もりを比較した')

  // 7. 禁止操作は DB で拒否（OAuth クライアントのトークンで直接 REST を叩く）
  const asGpt = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const del = await asGpt.from('tasks').delete().eq('id', taskId).select()
  expect(del.data ?? []).toEqual([])
  expect((await admin.from('tasks').select('id').eq('id', taskId)).data).toHaveLength(1)
  const ins = await asGpt.from('routines').insert({ title: 'GPTのルーティーン', rule_type: 'daily', start_date: jstDate(0) })
  expect(ins.error).not.toBeNull()
  const att = await asGpt.from('attachments').select('id')
  expect(att.data ?? []).toEqual([])
  // 操作記録は直接書けない（DB の変更から自動で作られる）
  const forged = await asGpt.from('agent_actions').insert({ action: 'x', summary: '偽の記録' })
  expect(forged.error).not.toBeNull()
  // メモは追記のみ。書き換え・通知の設定は REST から直接でも拒否
  const wipe = await asGpt.from('tasks').update({ memo: '' }).eq('id', taskId)
  expect(wipe.error?.message ?? '').toContain('追記のみ')
  const remind = await asGpt.from('tasks').update({ remind_at: new Date().toISOString() }).eq('id', taskId)
  expect(remind.error).not.toBeNull()
  // REST から直接変えても操作記録が残る
  const direct = await asGpt.from('tasks').update({ title: `${title} 改` }).eq('id', taskId)
  expect(direct.error).toBeNull()
  const { data: acts } = await admin.from('agent_actions').select('action, summary, client_id').eq('target_id', taskId).order('created_at')
  expect(acts?.map((a) => a.action)).toEqual(['add_task', 'update_task', 'update_task', 'update_task'])
  expect(acts?.every((a) => a.client_id === client.client_id)).toBe(true)
  expect(acts?.[1]?.summary).toContain('メモに追記：')
  expect(acts?.[3]?.summary).toContain('タイトルを')

  // 8. 設定画面：連携中のアプリと操作履歴
  await page.goto('./#/settings')
  await expect(page.getByRole('heading', { name: 'AI との連携' })).toBeVisible()
  await expect(page.getByText(clientName, { exact: true })).toBeVisible()
  await expect(page.getByText(`「${title}」を ${jstDate(1)} に追加`)).toBeVisible()
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/connect.png`, fullPage: true })

  // 9. 連携を解除すると、同じトークンでは使えない
  await page.locator('li', { hasText: clientName }).getByRole('button', { name: '連携を解除' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '解除' }).click()
  await expect(page.getByText(clientName, { exact: true })).toHaveCount(0)
  const after = await rpc(fnUrl, token, 'tools/call', { name: 'list_open_tasks', arguments: {} })
  expect(after.status).toBe(401)
  // REST から直接でも、同じトークンでは読めない・書けない
  const readAfter = await asGpt.from('tasks').select('id')
  expect(readAfter.data ?? []).toEqual([])
  const addAfter = await asGpt.from('tasks').insert({ title: '解除後', date: jstDate(0) })
  expect(addAfter.error).not.toBeNull()
})
