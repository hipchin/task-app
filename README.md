# やること（task-app）

日付ごとのリストに「＋ → 入力 → Enter」で放り込める、個人用タスク管理 PWA。仕様は [docs/SPEC.md](docs/SPEC.md)。

- 公開URL: https://hipchin.github.io/task-app/
- 構成: React 19 + TypeScript + Vite + vite-plugin-pwa / TanStack Query（IndexedDB 永続化） / Supabase（Postgres・Auth・Storage・Realtime）/ GitHub Pages

## 開発

```bash
npm install                 # リポジトリ直下（Supabase CLI）
npx supabase start          # ローカル Supabase（Docker が必要）
cd web && npm install
cp .env.example .env.local  # ローカルの URL と anon キーを記入（npx supabase status で確認）
npm run dev
```

| コマンド（web/） | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm test` | 単体テスト（日付ユーティリティ・expandRoutines など） |
| `npm run test:rls` | RLS の結合テスト（ローカル Supabase が必要） |
| `npm run test:e2e` | Playwright（本番ビルド＋ローカル Supabase） |
| `npm run lint` / `npm run build` | oxlint / 型チェック＋ビルド |

## デプロイ

`main` に push すると GitHub Actions が GitHub Pages に公開する。ビルド時の値はリポジトリ Variables:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（クライアント用の公開キー）
- `VITE_ALLOW_SIGNUP`（初回登録時だけ `true`）

service_role キーやその他の秘密情報はリポジトリに置かない（Supabase Secrets を使う）。

DB の変更は `supabase/migrations/` に追加して `npx supabase db push`。
