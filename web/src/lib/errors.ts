import { isOnline } from './online'

/** 利用者向けのエラーメッセージ（原因と次の行動） */
export function errorMessage(e: unknown, action: string): string {
  if (!isOnline()) return `${action}できませんでした。オフラインです。接続を確認してからもう一度お試しください。`
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
  if (/JWT|session|not authenticated|401/i.test(msg)) {
    return `${action}できませんでした。ログインの有効期限が切れた可能性があります。再度ログインしてください。`
  }
  return `${action}できませんでした。時間をおいてもう一度お試しください。${msg ? `（${msg}）` : ''}`
}
