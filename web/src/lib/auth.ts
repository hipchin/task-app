import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AUTH_STORAGE_KEY, supabase } from './supabase'

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: Session }

/**
 * 端末に保存済みのログイン情報を、通信せずにその場で読む。
 * supabase.auth.getSession() は、アクセストークンの期限が切れていると更新の通信が終わるまで返らない。
 * アプリを1時間以上あけて開くと毎回そうなり、その間は画面が真っ白だった。
 * 保存済みの情報で先に一覧（キャッシュ）を出し、更新は後ろで待つ。更新に失敗すればログイン画面に切り替わる。
 */
function readStoredSession(): Session | null {
  try {
    return parseStoredSession(localStorage.getItem(AUTH_STORAGE_KEY))
  } catch {
    return null
  }
}

/** 保存されている文字列から、ログイン済みとみなせるセッションを取り出す（壊れていれば null） */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(v) || typeof v.access_token !== 'string' || typeof v.refresh_token !== 'string') return null
  if (!isRecord(v.user) || typeof v.user.id !== 'string') return null
  return v as unknown as Session
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() => {
    const stored = readStoredSession()
    return stored ? { status: 'signedIn', session: stored } : { status: 'loading' }
  })
  useEffect(() => {
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setState(data.session ? { status: 'signedIn', session: data.session } : { status: 'signedOut' })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signedIn', session } : { status: 'signedOut' })
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])
  return state
}
