# HANDOFF：VS Code の Claude Code への引き継ぎ指示

このファイルを読んだ Claude Code は、以下を上から順に自律的に進めること。
仕様の正は `docs/SPEC.md`、開発ルールは `CLAUDE.md`。

## 背景（これまでの経緯の要約）
- 目的：個人用タスク管理PWA。今使っている市販アプリ（日付ごとのリスト、＋で即追加、完了で取り消し線）の操作感を保ったまま、①詳細・画像添付 ②ルーティーン ③Mac/iPhone同期 ④AI秘書 を足す
- MulmoClaude での代替を試したが「追加のたびに考える必要がある」ため不採用。**最優先は「何も考えずに放り込める」操作感**。追加は＋→入力→Enterで即反映、AIを経由しないこと
- 利用者は本人のみ。日本在住。Mac mini は常時起動
- 既存の個人プロジェクト（hipchin/notes-pwa）と同じ技術構成に揃える：React 19 + TypeScript + Vite + vite-plugin-pwa、oxlint、GitHub Pages

## ユーザー本人が行う作業（Claude Code は代行しない。必要になった時点で案内して待つ）
1. Supabase にログインし、プロジェクトを作成（名前 task-app、リージョン Tokyo）するか、Claude Code が CLI で作成できるよう `npx supabase login` を実行する
2. 初回だけ、公開URLを開いて自分のメールアドレスとパスワードでアカウント登録する（登録後、Claude Code が新規登録を無効化する）

## Claude Code が自動で行う作業
1. 作業フォルダの準備：`task-app` として git 初期化。`gh repo create hipchin/task-app --public` でリポジトリ作成（gh が未ログインならユーザーに `gh auth login` を案内）
2. Supabase：CLI でプロジェクトとリンクし、SPEC.md §2 のテーブル・RLS・Storage バケットをマイグレーションとして作成・適用
3. フロントエンド：SPEC.md の Phase 1 と Phase 2 をまとめて実装（最初のリリースにルーティーンを含める）
4. テスト：`expandRoutines` と日付ユーティリティの単体テスト（Vitest）、Playwright で主要操作（追加・完了・期間移動・詳細編集）の確認
5. デプロイ：GitHub Actions で GitHub Pages に公開。Supabase の URL と anon key はビルド時の環境変数（リポジトリ Variables）で渡す。service_role キーは絶対にリポジトリに置かない
6. ユーザー登録後：Supabase Auth の新規登録を無効化
7. Phase 2.5（通知）、Phase 3（ショートカット）は、ユーザーが数日使ってから着手する

## 完了時の報告
- 公開URL
- iPhoneでの使い始め方（Safariで開く → 共有 → ホーム画面に追加 → ログイン）
- 受け入れ条件（SPEC.md §5 の Phase 1・2）の結果表。未確認のものは未確認と書く
