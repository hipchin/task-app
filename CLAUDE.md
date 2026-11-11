# CLAUDE.md

個人用タスク管理PWA。仕様は `docs/SPEC.md` が正。仕様と矛盾する実装をする前に必ず確認すること。

## 進め方
- フェーズ順に実装する（SPEC.md §5）。各フェーズの受け入れ条件をすべて満たしてから次へ進む
- 仕様の「TODO-n」に該当する箇所は勝手に決めず、仮実装のうえ TODO コメントを残す

## 技術ルール
- TypeScript strict。`any` を使わない
- 日付は `YYYY-MM-DD` 文字列で扱い、JST前提のユーティリティ（`web/src/lib/date.ts`）を経由する
- DB変更は `supabase/migrations/` のマイグレーションでのみ行う。RLSを必ず付ける
- 秘密情報をフロントエンドやリポジトリに置かない（Supabase Secretsを使う）
- `expandRoutines` などの純粋関数には単体テスト（Vitest）を書く

## コマンド
- リポジトリ直下: `npx supabase start`（ローカル）/ `npx supabase db push`（本番へマイグレーション適用）
- web/: `npm run dev` / `npm test`（単体）/ `npm run test:rls`（RLS、ローカルSupabase必須）/ `npm run test:e2e`（Playwright、ローカルSupabase必須）/ `npm run lint` / `npm run build`
- MCP（AI連携）: `npx supabase functions serve`（ローカル）/ `npx supabase functions deploy mcp`（本番）。`supabase/functions/mcp` は `web/src/lib` の純粋関数を相対パスで共有する（そのため lib 内の import は `.ts` 拡張子付き）
- デプロイ: main へ push → GitHub Actions → GitHub Pages。ビルド値はリポジトリ Variables（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_ALLOW_SIGNUP）
