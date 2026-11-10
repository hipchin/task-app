import { defineConfig, devices } from '@playwright/test'

// 本番と同じビルド（Service Worker あり）をローカルの Supabase に向けて確認する。
// 事前に `npx supabase start`（リポジトリ直下）を実行しておくこと。
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:4173/task-app/',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/task-app/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
