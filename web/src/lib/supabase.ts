import { createClient } from '@supabase/supabase-js'
import { trackingFetch } from './online'

// クライアント用の公開キー（anon / publishable）だけを使う。service_role キーは絶対に置かない。
const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isConfigured = url !== '' && anonKey !== ''

/** ログイン情報を保存する localStorage のキー（auth.ts が起動直後に直接読む） */
export const AUTH_STORAGE_KEY = 'task-app-auth'

export const supabase = createClient(isConfigured ? url : 'http://localhost', isConfigured ? anonKey : 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
  },
  global: { fetch: trackingFetch },
})

export const ATTACHMENTS_BUCKET = 'attachments'

/** 初回の自分のアカウント登録用。登録後はリポジトリ Variables で false にする */
export const allowSignup = import.meta.env.VITE_ALLOW_SIGNUP === 'true'

/** ChatGPT などに登録する MCP サーバーの URL（SPEC Phase 3） */
export const mcpServerUrl = isConfigured ? `${url.replace(/\/$/, '')}/functions/v1/mcp` : ''
