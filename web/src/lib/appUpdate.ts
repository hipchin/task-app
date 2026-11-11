/** 設定画面の「アップデートを確認」から使う。Service Worker の更新を手動で確認・適用する */

export type UpdateResult = 'updating' | 'latest' | 'unsupported'

function waitInstalled(sw: ServiceWorker): Promise<void> {
  if (sw.state === 'installed' || sw.state === 'activated') return Promise.resolve()
  return new Promise((resolve, reject) => {
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' || sw.state === 'activated') resolve()
      else if (sw.state === 'redundant') reject(new Error('update failed'))
    })
  })
}

let reloading = false

function applyAndReload(waiting: ServiceWorker) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
  // vite-plugin-pwa（registerType: 'prompt'）の Service Worker はこのメッセージで切り替わる
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export async function checkForUpdate(): Promise<UpdateResult> {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'unsupported'
  await reg.update()
  const next = reg.installing ?? reg.waiting
  if (!next) return 'latest'
  await waitInstalled(next)
  const waiting = reg.waiting ?? next
  // 初回インストール直後（制御中の SW がない）は切り替え不要
  if (!navigator.serviceWorker.controller) return 'latest'
  applyAndReload(waiting)
  return 'updating'
}
