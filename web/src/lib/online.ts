import { useSyncExternalStore } from 'react'

// オンライン判定：navigator.onLine と、リクエストの失敗（ネットワークエラー）の両方を見る（SPEC §3.5）

let requestFailed = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function reportNetworkFailure() {
  if (!requestFailed) {
    requestFailed = true
    emit()
  }
}

export function reportNetworkSuccess() {
  if (requestFailed) {
    requestFailed = false
    emit()
  }
}

export function isOnline(): boolean {
  return navigator.onLine && !requestFailed
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onOnline = () => {
    requestFailed = false
    cb()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true)
}

/** Supabase クライアントに渡す fetch。ネットワークエラーをオフラインとして記録する */
export const trackingFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init)
    reportNetworkSuccess()
    return res
  } catch (e) {
    if (e instanceof TypeError) reportNetworkFailure()
    throw e
  }
}
