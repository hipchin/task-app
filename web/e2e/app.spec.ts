import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { credentials, localSupabase } from './env.ts'

// JST の今日・明日（テストは timezoneId: Asia/Tokyo で動かす）
function jstDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}
const TODAY = jstDate(0)
const TOMORROW = jstDate(1)

async function login(page: Page) {
  const { email, password } = credentials()
  await page.goto('./')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: 'やること', level: 1 })).toBeVisible()
}

const day = (page: Page, date: string) => page.locator(`section[data-date="${date}"]`)

/** 「今日」のセクションの「＋ 追加」で続けて追加する（日ごとの「＋」は 2026-11-12 に廃止） */
async function quickAdd(page: Page, titles: string[]) {
  const section = day(page, TODAY)
  await section.getByRole('button', { name: /にタスクを追加/ }).click()
  const input = section.getByRole('textbox')
  for (const t of titles) {
    await input.fill(t)
    await input.press('Enter')
  }
  await input.press('Escape')
}

/** その日のルーティーンのまとめ行を開く（閉じていれば） */
async function expandRoutines(page: Page, date: string) {
  const summary = day(page, date).getByRole('button', { name: /ルーティーン \d+\/\d+ 済/ })
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click()
  await expect(summary).toHaveAttribute('aria-expanded', 'true')
}

/** 対応中の帯を開く（初期値は閉じている） */
async function expandOpen(page: Page) {
  const toggle = page.locator('section.open-section').getByRole('button', { name: /対応中/ })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

test.describe.configure({ mode: 'serial' })

test('ログインでき、再読み込みしてもログインが保持される', async ({ page }) => {
  await login(page)
  await expect(day(page, TODAY).getByText('今日')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'やること', level: 1 })).toBeVisible()
})

test('＋で続けて追加でき、すぐに表示される', async ({ page }) => {
  await login(page)
  const a = `牛乳を買う ${Date.now()}`
  const b = `メール返信 ${Date.now()}`
  await quickAdd(page, [a, b])
  const section = day(page, TODAY)
  await expect(section.getByText(a)).toBeVisible()
  await expect(section.getByText(b)).toBeVisible()
  // 追加した順に並ぶ
  const titles = await section.locator('.row-title').allTextContents()
  expect(titles.indexOf(a)).toBeLessThan(titles.indexOf(b))
  await page.reload()
  await expect(day(page, TODAY).getByText(a)).toBeVisible()
})

test('完了チェックで取り消し線が付き、もう一度押すと戻る', async ({ page }) => {
  await login(page)
  const t = `完了テスト ${Date.now()}`
  await quickAdd(page, [t])
  const row = day(page, TODAY).locator('li.row', { hasText: t })
  const check = row.getByRole('checkbox')
  await check.click()
  await expect(check).toHaveAttribute('aria-checked', 'true')
  await expect(row.locator('.row-title')).toHaveCSS('text-decoration-line', 'line-through')
  await page.reload()
  await expect(day(page, TODAY).locator('li.row', { hasText: t }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await day(page, TODAY).locator('li.row', { hasText: t }).getByRole('checkbox').click()
  await expect(day(page, TODAY).locator('li.row', { hasText: t }).locator('.row-title')).toHaveCSS('text-decoration-line', 'none')

  // 「すべて」を切り替えると未完了だけになる（TODO-1 の仮仕様）
  await day(page, TODAY).locator('li.row', { hasText: t }).getByRole('checkbox').click()
  await page.getByRole('button', { name: 'すべて' }).click()
  await expect(day(page, TODAY).getByText(t)).toBeHidden()
  await page.getByRole('button', { name: '未完了' }).click()
  await expect(day(page, TODAY).getByText(t)).toBeVisible()
})

test('期間の移動と「今日へ戻る」', async ({ page }) => {
  await login(page)
  const label = page.locator('.period-label')
  // 今日を含む期間では期間の表示も「今日へ戻る」も出さない
  await expect(label).toHaveCount(0)
  await expect(page.getByRole('button', { name: '今日へ戻る' })).toHaveCount(0)
  await page.getByRole('button', { name: '次の期間' }).click()
  await expect(label).toBeVisible()
  const next = await label.textContent()
  await expect(day(page, TODAY)).toHaveCount(0)
  await page.getByRole('button', { name: '前の期間' }).click()
  await page.getByRole('button', { name: '前の期間' }).click()
  await expect(label).not.toHaveText(next ?? '')
  await expect(day(page, TODAY)).toHaveCount(0)
  await page.getByRole('button', { name: '今日へ戻る' }).click()
  await expect(label).toHaveCount(0)
  await expect(day(page, TODAY)).toBeVisible()
})

test('詳細画面でメモを編集し、日付を変更できる', async ({ page }) => {
  await login(page)
  const t = `詳細テスト ${Date.now()}`
  await quickAdd(page, [t])
  await day(page, TODAY).getByRole('link', { name: `${t} の詳細` }).click()
  await expect(page.getByRole('heading', { name: '詳細' })).toBeVisible()
  await page.getByLabel('メモ').fill('1行目\n2行目')
  await page.getByLabel('日付').fill(TOMORROW)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('heading', { name: 'やること', level: 1 })).toBeVisible()
  await expect(day(page, TODAY).getByText(t)).toHaveCount(0)
  await expect(day(page, TOMORROW).getByText(t)).toBeVisible()
  await day(page, TOMORROW).getByRole('link', { name: `${t} の詳細` }).click()
  await expect(page.getByLabel('メモ')).toHaveValue('1行目\n2行目')
})

test('画像を3枚添付でき、縮小後は1枚1MB未満', async ({ page }) => {
  await login(page)
  const t = `画像テスト ${Date.now()}`
  await quickAdd(page, [t])
  await day(page, TODAY).getByRole('link', { name: `${t} の詳細` }).click()

  // 4000x3000 のノイズ画像（縮小・再圧縮しないと数MBになる）
  const files = await Promise.all(
    [1, 2, 3].map(async (i) => {
      const w = 4000
      const h = 3000
      // 写真に近い画像：ランダムノイズをぼかして細部のある面にする
      const raw = randomBytes(w * h * 3)
      const buffer = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
        .blur(1.2 + i * 0.3)
        .jpeg({ quality: 92 })
        .toBuffer()
      return { name: `photo${i}.jpg`, mimeType: 'image/jpeg', buffer }
    }),
  )
  // 元画像は1枚1MBを超える（iPhone の写真相当）
  expect(files.every((f) => f.buffer.length > 1_000_000)).toBe(true)
  console.log('original sizes', files.map((f) => f.buffer.length))
  await page.getByTestId('file-input').setInputFiles(files)
  await expect(page.locator('.thumb img')).toHaveCount(3, { timeout: 30_000 })

  // Storage 上のサイズと寸法を確認する
  const { url, service } = localSupabase()
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { id: userId } = credentials()
  const { data: task } = await admin.from('tasks').select('id').eq('title', t).single()
  const { data: atts } = await admin.from('attachments').select('*').eq('task_id', task?.id ?? '')
  expect(atts).toHaveLength(3)
  for (const a of atts ?? []) {
    expect(Math.max(a.width, a.height)).toBeLessThanOrEqual(2048)
    const { data: blob } = await admin.storage.from('attachments').download(a.storage_path)
    expect(blob?.type).toBe('image/jpeg')
    console.log('resized', a.width, a.height, blob?.size)
    expect(blob?.size ?? Infinity).toBeLessThan(1_000_000)
    expect(a.storage_path.startsWith(`${userId}/`)).toBe(true)
  }

  // 一覧にクリップアイコンが付く
  await page.getByRole('button', { name: '一覧' }).click()
  await expect(day(page, TODAY).locator('li.row', { hasText: t }).getByRole('img', { name: '画像あり' })).toBeVisible()

  // 全画面表示と削除
  await day(page, TODAY).getByRole('link', { name: `${t} の詳細` }).click()
  await page.getByRole('button', { name: /画像 1 を全画面で表示/ }).click()
  await expect(page.getByRole('dialog', { name: '画像の全画面表示' })).toBeVisible()
  await page.getByRole('dialog', { name: '画像の全画面表示' }).getByRole('button', { name: '削除' }).click()
  await page.getByRole('dialog', { name: '画像を削除しますか？' }).getByRole('button', { name: '削除' }).click()
  await expect(page.locator('.thumb img')).toHaveCount(2)
})

test('タスクを削除できる（確認ダイアログあり）', async ({ page }) => {
  await login(page)
  const t = `削除テスト ${Date.now()}`
  await quickAdd(page, [t])
  await day(page, TODAY).getByRole('link', { name: `${t} の詳細` }).click()
  await page.getByRole('button', { name: '削除' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click()
  await expect(page.getByLabel('タイトル')).toHaveValue(t)
  await page.getByRole('button', { name: '削除' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '削除' }).click()
  await expect(page.getByRole('heading', { name: 'やること', level: 1 })).toBeVisible()
  await expect(day(page, TODAY).getByText(t)).toHaveCount(0)
})

test('ルーティーン：毎週（曜日指定）が該当日だけに表示され、日ごとに完了が独立する', async ({ page }) => {
  await login(page)
  const name = `筋トレ ${Date.now()}`
  await page.getByRole('link', { name: 'ルーティーン' }).click()
  await page.getByRole('button', { name: '新規' }).click()
  await page.getByLabel('タイトル').fill(name)
  await page.getByText('毎週', { exact: true }).click()
  for (const d of ['月', '水', '金']) await page.getByRole('group', { name: '曜日' }).getByText(d, { exact: true }).click()
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText(name)).toBeVisible()
  await expect(page.getByText('毎週 月・水・金')).toBeVisible()
  await page.getByRole('link', { name: '一覧' }).click()

  // 今日：曜日が該当するときだけまとめ行に出る。これから（明日以降）にはルーティーンを出さない
  const isMwf = (d: string) => [1, 3, 5].includes(new Date(`${d}T00:00:00Z`).getUTCDay())
  if (isMwf(TODAY)) await expect(day(page, TODAY).locator('.routine-summary', { hasText: name })).toBeVisible()
  else await expect(day(page, TODAY).getByText(name)).toHaveCount(0)
  await expect(page.locator('section.upcoming').getByText(name)).toHaveCount(0)

  // 2週間前から始まっていたことにして、前の期間（過去の日）で該当日だけに出ることを確かめる
  const { url, service } = localSupabase()
  const admin = createClient(url, service, { auth: { persistSession: false } })
  await admin.from('routines').update({ start_date: jstDate(-14) }).eq('title', name)
  await page.reload()
  await page.getByRole('button', { name: '前の期間' }).click()
  const expected = Array.from({ length: 14 }, (_, i) => jstDate(i - 14)).filter(isMwf)
  for (const d of expected) await expect(day(page, d).locator('.routine-summary', { hasText: name })).toBeVisible()
  const shown = await page
    .locator('section[data-date]')
    .filter({ has: page.locator('.routine-summary', { hasText: name }) })
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-date') ?? ''))
  expect(shown).toEqual(expected)

  // 最初の該当日だけ完了にする
  const [first, second] = expected
  if (!first || !second) throw new Error('該当日が足りない')
  await expandRoutines(page, first)
  await day(page, first).locator('li.row', { hasText: name }).getByRole('checkbox').click()
  await expect(day(page, first).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expandRoutines(page, first)
  await expandRoutines(page, second)
  await expect(day(page, first).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await expect(day(page, second).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  await expect(day(page, first).locator('li.row', { hasText: name }).getByRole('img', { name: 'ルーティーン' })).toBeVisible()
  await page.getByRole('button', { name: '今日へ戻る' }).click()
})

test('ルーティーン：毎日・毎月・平日を作成できる', async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const make = async (title: string, type: string, pick?: () => Promise<void>) => {
    await page.goto('./#/routines/new')
    await page.getByLabel('タイトル').fill(title)
    await page.getByText(type, { exact: true }).click()
    if (pick) await pick()
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByRole('heading', { name: 'ルーティーン', exact: true })).toBeVisible()
  }
  await make(`毎日 ${stamp}`, '毎日')
  await make(`毎月 ${stamp}`, '毎月', async () => {
    await page.getByRole('group', { name: '日付' }).getByText('15', { exact: true }).click()
  })
  await make(`平日 ${stamp}`, '平日')
  await expect(page.getByText(`毎日 ${stamp}`)).toBeVisible()
  await expect(page.getByText('毎月 15日')).toBeVisible()
  await expect(page.getByText(`平日 ${stamp}`)).toBeVisible()
  await page.goto('./')
  // 今日はまとめ行に出て、開くと個別の行になる
  await expect(day(page, TODAY).locator('.routine-summary', { hasText: `毎日 ${stamp}` })).toBeVisible()
  await expect(day(page, TODAY).locator('li.row', { hasText: `毎日 ${stamp}` })).toHaveCount(0)
  await expandRoutines(page, TODAY)
  await expect(day(page, TODAY).locator('li.row', { hasText: `毎日 ${stamp}` })).toBeVisible()
})

test('ルーティーンの日別詳細で完了とメモを記録できる', async ({ page }) => {
  await login(page)
  const name = `日別 ${Date.now()}`
  await page.goto('./#/routines/new')
  await page.getByLabel('タイトル').fill(name)
  await page.getByRole('button', { name: '保存' }).click()
  await page.goto('./')
  await expandRoutines(page, TODAY)
  await day(page, TODAY).getByRole('link', { name: `${name} の詳細` }).click()
  await page.getByLabel('この日の完了状態（完了）').check()
  await page.getByLabel('この日のメモ').fill('今日は10回')
  await page.getByRole('button', { name: 'メモを保存' }).click()
  await expect(page.getByText('メモを保存しました。')).toBeVisible()
  await expect(page.getByRole('link', { name: 'ルーティーン本体を編集' })).toBeVisible()
  await page.getByRole('button', { name: '一覧' }).click()
  // 今日のまとめ行の開閉は保存されているので、開いたまま戻る
  await expect(day(page, TODAY).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  // 明日以降にはルーティーンを出さない
  await expect(page.locator('section.upcoming').getByText(name)).toHaveCount(0)
})

test('別の端末で追加したタスクが5秒以内に反映される（Realtime）', async ({ browser }) => {
  const iphone = await browser.newContext()
  const mac = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const p1 = await iphone.newPage()
  const p2 = await mac.newPage()
  await login(p1)
  await login(p2)
  // 購読が確立するのを待つ
  await p2.waitForTimeout(1500)
  const t = `同期テスト ${Date.now()}`
  await quickAdd(p1, [t])
  await expect(day(p2, TODAY).getByText(t)).toBeVisible({ timeout: 5_000 })
  // 完了状態も反映される
  await day(p1, TODAY).locator('li.row', { hasText: t }).getByRole('checkbox').click()
  await expect(day(p2, TODAY).locator('li.row', { hasText: t }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 })
  await iphone.close()
  await mac.close()
})

test('オフラインで起動しても直近のデータが表示され、編集操作は無効', async ({ page, context }) => {
  await login(page)
  const t = `オフライン ${Date.now()}`
  await quickAdd(page, [t])
  await expect(day(page, TODAY).getByText(t)).toBeVisible()
  // Service Worker の準備とキャッシュの永続化を待つ
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.waitForTimeout(1500)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('オフライン（閲覧のみ）')).toBeVisible()
  await expect(day(page, TODAY).getByText(t)).toBeVisible()
  await expect(day(page, TODAY).locator('li.row', { hasText: t }).getByRole('checkbox')).toBeDisabled()
  await expect(day(page, TODAY).getByRole('button', { name: /にタスクを追加/ })).toBeDisabled()
  await day(page, TODAY).getByRole('link', { name: `${t} の詳細` }).click()
  await expect(page.getByText('オフラインのため編集できません。')).toBeVisible()
  await expect(page.getByLabel('タイトル')).toBeDisabled()
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()

  await context.setOffline(false)
  await page.getByRole('button', { name: '一覧' }).click()
  await expect(page.getByText('オフライン（閲覧のみ）')).toBeHidden()
  await expect(day(page, TODAY).getByRole('button', { name: /にタスクを追加/ })).toBeEnabled()
})

test('昨日の未完了ルーティーンは今日に繰り越されず、ルール変更後も昨日までの履歴は変わらない', async ({ page }) => {
  const { url, service } = localSupabase()
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { id: userId } = credentials()
  const YESTERDAY = jstDate(-1)
  const TWO_DAYS_AGO = jstDate(-2)
  const name = `履歴 ${Date.now()}`
  // 3日前から毎日のルーティーン。一昨日は完了、昨日は未完了
  const { data: r, error } = await admin
    .from('routines')
    .insert({ user_id: userId, title: name, rule_type: 'daily', start_date: jstDate(-3) })
    .select()
    .single()
  if (error) throw error
  await admin.from('routine_logs').insert({ user_id: userId, routine_id: r.id, date: TWO_DAYS_AGO, done: true })

  await login(page)
  await expandRoutines(page, TODAY)
  // 今日の行は1つだけ（繰り越されて2つにならない）・未完了
  await expect(day(page, TODAY).locator('li.row', { hasText: name })).toHaveCount(1)
  await expect(day(page, TODAY).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')

  // ルールを「毎週（今日の曜日以外）」に変更する
  const todayDow = new Date(`${TODAY}T00:00:00Z`).getUTCDay()
  const other = ['日', '月', '火', '水', '木', '金', '土'][(todayDow + 3) % 7] ?? '月'
  await page.goto(`./#/routines/${r.id}`)
  await page.getByText('毎週', { exact: true }).click()
  await page.getByRole('group', { name: '曜日' }).getByText(other, { exact: true }).click()
  await expect(page.getByRole('note')).toContainText('昨日までの記録は今のルールのまま残り')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('heading', { name: 'ルーティーン', exact: true })).toBeVisible()

  // 旧ルーティーンは昨日で終了、新ルーティーンは今日開始
  const { data: rows } = await admin.from('routines').select('*').eq('title', name).order('created_at')
  expect(rows).toHaveLength(2)
  expect(rows?.[0]?.end_date).toBe(YESTERDAY)
  expect(rows?.[1]?.start_date).toBe(TODAY)
  expect(rows?.[1]?.rule_type).toBe('weekly')

  // 一昨日・昨日の表示と完了状態は変わらない
  await page.goto('./')
  await page.getByRole('button', { name: '前の期間' }).click()
  await expandRoutines(page, TWO_DAYS_AGO)
  await expandRoutines(page, YESTERDAY)
  await expect(day(page, TWO_DAYS_AGO).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await expect(day(page, YESTERDAY).locator('li.row', { hasText: name }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: '今日へ戻る' }).click()
  await expect(day(page, TODAY).getByText(name)).toHaveCount(0)
})

test('設定画面でアップデートを確認できる', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '設定' }).click()
  await expect(page.getByRole('heading', { name: 'バージョン' })).toBeVisible()
  await page.getByRole('button', { name: 'アップデートを確認' }).click()
  await expect(page.getByText(/最新のバージョンです|このブラウザでは確認できません|更新しています/)).toBeVisible()
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/settings.png`, fullPage: true })
  if (process.env.SHOTS) {
    await page.getByRole('link', { name: '一覧' }).click()
    await page.screenshot({ path: `${process.env.SHOTS}/list.png` })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: `${process.env.SHOTS}/list-dark.png` })
  }
})

test('対応中：日付を過ぎた未完了タスクが出て、ルーティーンは出ない', async ({ page }) => {
  const { url, service } = localSupabase()
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { id: userId } = credentials()
  const stamp = Date.now()
  const late = `書類準備 ${stamp}`
  const due = `見積もり ${stamp}`
  const soon = `請求書 ${stamp}`
  const routine = `日課 ${stamp}`
  const { error } = await admin.from('tasks').insert([
    { user_id: userId, title: late, date: jstDate(-40) },
    { user_id: userId, title: due, date: jstDate(-2), due_date: jstDate(3) },
    { user_id: userId, title: soon, date: jstDate(-3), due_date: TOMORROW },
  ])
  if (error) throw error
  await admin.from('routines').insert({ user_id: userId, title: routine, rule_type: 'daily', start_date: jstDate(-5) })

  await login(page)
  const open = page.locator('section.open-section')
  await expect(open.getByRole('heading', { name: /対応中/ })).toBeVisible()
  // 初期値は閉じている
  await expect(open.getByText(late)).toBeHidden()
  // 締め切りが明日のものは「今日」に出て、対応中には重ねて出ない
  await expect(day(page, TODAY).locator('li.row', { hasText: soon })).toContainText('（あと1日）')
  await expandOpen(page)
  await expect(open.getByText(soon)).toHaveCount(0)
  await expect(open.getByText(late)).toBeVisible()
  await expect(open.getByText(due)).toBeVisible()
  await expect(open.getByText(routine)).toHaveCount(0)
  // 締め切りのあるものが先、残り日数が出る
  const titles = await open.locator('.row-title').allTextContents()
  expect(titles.indexOf(due)).toBeLessThan(titles.indexOf(late))
  await expect(open.locator('li.row', { hasText: due })).toContainText('（あと3日）')
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/open.png` })

  // 折りたたみ
  await open.getByRole('button', { name: /対応中/ }).click()
  await expect(open.getByText(late)).toBeHidden()
  await open.getByRole('button', { name: /対応中/ }).click()
  await expect(open.getByText(late)).toBeVisible()

  // 完了すると帯から消える（DB でも完了）
  await open.locator('li.row', { hasText: late }).getByRole('checkbox').click()
  await expect(open.getByText(late)).toHaveCount(0)
  const { data } = await admin.from('tasks').select('done').eq('title', late).single()
  expect(data?.done).toBe(true)
})

test('締め切りは日付より前にできない', async ({ page }) => {
  await login(page)
  const name = `締め切り ${Date.now()}`
  const { url, service } = localSupabase()
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { id: userId } = credentials()
  await admin.from('tasks').insert({ user_id: userId, title: name, date: TOMORROW })
  await page.reload()
  await day(page, TOMORROW).getByRole('link', { name: `${name} の詳細` }).click()
  await page.getByLabel('締め切り（任意）').fill(TODAY)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('締め切りは日付と同じ日か、それより後にしてください。')).toBeVisible()
  await page.getByLabel('締め切り（任意）').fill(TOMORROW)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('heading', { name: 'やること', level: 1 })).toBeVisible()
})
