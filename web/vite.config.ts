/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages（https://hipchin.github.io/task-app/）で配信する
const base = process.env.VITE_BASE_PATH ?? '/task-app/'

// 設定画面に出すバージョン：package.json の version＋ビルド日時（JST）＋コミット
function appVersion(): string {
  const jst = new Date(Date.now() + 9 * 3600_000).toISOString()
  const stamp = `${jst.slice(0, 10).replaceAll('-', '.')} ${jst.slice(11, 16)}`
  const sha = process.env.GITHUB_SHA?.slice(0, 7)
  return `${process.env.npm_package_version ?? '0.0.0'}（${stamp}${sha ? ` / ${sha}` : ''}）`
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'やること',
        short_name: 'やること',
        description: '日付ごとに放り込めるタスク管理',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        lang: 'ja',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: `${base}index.html`,
        // Supabase へのリクエストは Service Worker でキャッシュしない（データは TanStack Query の永続化で扱う）
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    // RLS の結合テストはローカル Supabase が必要なので npm run test:rls で別に実行する
    include: process.env.RLS_TEST ? ['tests/**/*.test.ts'] : ['src/**/*.test.ts'],
    testTimeout: 15_000,
  },
})
