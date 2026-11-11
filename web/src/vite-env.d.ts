/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ALLOW_SIGNUP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** ビルド時に埋め込む表示用のバージョン（vite.config.ts の define） */
declare const __APP_VERSION__: string
