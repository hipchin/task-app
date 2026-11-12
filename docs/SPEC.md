# タスク管理PWA 仕様書 v0.1

最終更新: 2026-11-12
利用者: 開発者本人のみ（1ユーザー）
タイムゾーン: Asia/Tokyo 固定

---

## 0. 決定事項

| 項目 | 決定 |
|---|---|
| 配布形態 | PWA（iPhoneはホーム画面に追加、Macはブラウザまたは「Dockに追加」） |
| 利用者 | 本人のみ |
| フロントエンド | React + TypeScript + Vite + vite-plugin-pwa |
| データ取得 | TanStack Query（IndexedDBに永続化） |
| バックエンド | Supabase（Postgres / Auth / Storage / Realtime / Edge Functions / pg_cron） |
| ホスティング | GitHub Pages（公開リポジトリ hipchin/task-app、GitHub Actions でデプロイ。秘密情報はリポジトリに置かない） |
| オフライン | 簡易版：閲覧のみ可、編集はオンライン時のみ |
| 通知 | Web Push（iOS 16.4以降・ホーム画面追加時のみ） |
| ルーティーン未実行 | その日の未完了として残り、翌日へ繰り越さない |
| 通常タスクの未完了 | 日付を過ぎたものはすべて一覧上部の「対応中」に集める（2026-11-11 追加） |
| AI秘書 | アプリ側からLLMのAPIは呼ばない。ChatGPT（Plus）からリモートMCPサーバーに接続してもらう（2026-11-11 変更） |

### 未決事項（TODO）
- TODO-1: 上部「すべて」ボタンの意味（全件表示／未完了のみの切り替え、と仮定）
- TODO-2: 平日ルールで日本の祝日を除外するか（v1では除外しない）
- TODO-3: 毎月31日のように存在しない日があるルールの扱い（v1ではその月はスキップ）
- ~~TODO-4: AI秘書で使うモデル~~ → ChatGPT から MCP で接続する形に決定（2026-11-11）
- ~~TODO-7: ChatGPT Plus で書き込み系のツールが使えるか~~ → 使える（2026-11-11 実機で確認。開発者モードは不要で「プラグイン」→「＋」→「カスタムMCPサーバーを追加」）
- TODO-5: iPhoneのHEIC画像がブラウザでJPEGに変換されるか、実機で確認する
- TODO-6: Deno（Edge Functions）上でWeb Push送信ライブラリが動くか、実装時に確認する

---

## 1. 画面

### 1.1 一覧画面（メイン）
開いたときに「今日やること」だけが最初の1画面に収まることを優先する（2026-11-12 変更。旧版は1か月分の全日を縦に並べていた）。

- 上部ヘッダー：タイトル「やること」・前の期間／次の期間（1か月単位）・「すべて」切り替え。今日を含まない期間を表示しているときだけ「今日へ戻る」を出す
- 表示期間：初期値は今日から1か月。今日を含まない期間を表示しているときだけ「YYYY年M月D日〜M月D日」を出す
- 表示順（今日を含む期間）：「今日」→「対応中」→「これから」
- 「今日」のセクション：見出し「今日 M月D日(曜)」
  - 今日の日付の通常タスク → 締め切りが近い対応中タスク（締め切りが明日以前のもの。§3.7）→ ルーティーンのまとめ行 → 「＋ 追加」
  - ルーティーンのまとめ行：「ルーティーン N/M 済」と名前の一覧を1行で出し、タップで個別の行を開閉する（開閉状態は端末に保存。初期値は閉じる）
- 「これから」：明日から期間の終わりまでのうち、通常タスクがある日だけを「M月D日(曜)」の小見出しで並べる。ルーティーンは出さない（先の日は完了の操作をしないため）。何もない日は出さない
  - 1件もなければ「これからの予定はありません」と出す
- 今日を含まない期間：「対応中」→ タスクのある日だけを日付順に並べる。今日より前の日はルーティーンのまとめ行も出す（あとから完了を付けられるように）
- 小見出しの曜日：土曜は青、日曜は赤で表示する
- タスク行：左に完了チェック、中央にタイトル、右に詳細ボタン
  - 完了するとタイトルに取り消し線を引き、行全体を薄く表示する
  - ルーティーン由来の行には繰り返しアイコンを付ける
  - 画像が添付されている行にはクリップアイコンを付ける
- 「＋ 追加」：「今日」のセクションの末尾にだけ置く。今日の日付でタスクを素早く追加する（タイトルだけ入力）。別の日にしたいときは詳細画面で日付を変える
- 「対応中」（§3.7）：表示中の期間に関係なく常に出す。初期値は閉じた状態で、見出しに件数と、いちばん古い日付を出す
  - 「今日」のセクションに出したもの（締め切りが明日以前）は「対応中」には重ねて出さない
  - 行の下に補足を出す：締め切りがあれば「締め切り M月D日（あとN日／今日まで／N日超過）」、なければ「M月D日から」
  - 開閉状態は端末に保存する
  - 0件のときは出さない
- オフライン時：画面上部に「オフライン（閲覧のみ）」のバナーを出し、追加・編集・完了の操作を無効にする

### 1.2 タスク詳細画面（①）
- 項目：タイトル、日付、締め切り（任意・日付より前は不可）、メモ（複数行）、リマインダー日時、画像（複数枚）
- 画像：タップで全画面表示、長押しまたはボタンで削除
- 操作：保存・削除（削除は確認ダイアログを出す）
- ルーティーン由来の行から開いた場合：
  - 「この日の完了状態」と「ルーティーン本体を編集」へのリンクを表示する
  - ルール本体の編集はルーティーン編集画面で行う

### 1.3 ルーティーン一覧・編集画面（②）
- 一覧：タイトル、ルールの要約（例「毎週 月・水・金」）、有効／終了済み
- 編集項目：タイトル、メモ、ルール種別、開始日、終了日（任意）、通知時刻（任意）

### 1.4 設定画面
- 通知のオン／オフ（オンにするとき通知の許可を求める。ユーザーがタップしたときに要求すること）
- 連携中のアプリ（ChatGPT など）の一覧と解除、AIの操作履歴（Phase 3）
- バージョン表示と「アップデートを確認」
- ログアウト

### 1.5 ログイン画面
- メールアドレスとパスワードでログインする
- **マジックリンク方式は使わない**：iOSのホーム画面アプリはSafariとストレージが分かれており、メールのリンクがSafari側で開かれてしまうため
- 自分のアカウントを作成したら、Supabase側で新規登録を無効にする

---

## 2. データモデル（Postgres）

すべてのテーブルに `user_id uuid not null references auth.users` を持たせ、RLSで `user_id = auth.uid()` に限定する。

```sql
-- 通常タスク
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  title text not null,
  memo text not null default '',
  date date not null,                 -- 表示する日（JST）。期間のあるタスクでは開始日
  due_date date,                      -- 締め切り（任意）。due_date >= date
  done boolean not null default false,
  done_at timestamptz,
  sort_order double precision not null default 0,
  remind_at timestamptz,              -- 任意
  notified_at timestamptz,            -- 通知の送信済み記録
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ルーティーン（ルール）
create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  title text not null,
  memo text not null default '',
  rule_type text not null check (rule_type in ('daily','weekly','monthly','weekdays')),
  rule_days int[],                    -- weekly: 0=日〜6=土 / monthly: [日付]
  start_date date not null,
  end_date date,                      -- null = 無期限
  remind_time time,                   -- 任意（JST）
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ルーティーンの日別記録（完了・メモ・通知済み）
create table routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  routine_id uuid not null references routines on delete cascade,
  date date not null,
  done boolean not null default false,
  memo text not null default '',
  notified_at timestamptz,
  unique (routine_id, date)
);

-- 添付画像（通常タスク・ルーティーンの日別記録の両方に付けられる）
create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  task_id uuid references tasks on delete cascade,
  routine_log_id uuid references routine_logs on delete cascade,
  storage_path text not null,
  width int, height int,
  created_at timestamptz not null default now(),
  check (num_nonnulls(task_id, routine_log_id) = 1)
);

-- Web Push 購読
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- AI の操作記録（Phase 3。OAuth クライアント経由の書き込みを残す）
create table agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  client_id text,                     -- JWT の client_id（DB側で自動で入れる）
  action text not null,               -- add_task / set_task_done など
  target_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);

-- ショートカット用トークン（旧 Phase 3。今は使わない）
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  token_hash text not null unique,    -- 平文は保存しない
  label text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
```

### Storage
- バケット `attachments`（非公開）
- パス：`{user_id}/{attachment_id}.jpg`
- 表示は署名付きURL（有効期限1時間）を使う
- ストレージのポリシーも、パスの先頭が `auth.uid()` のものだけ読み書きできるようにする

---

## 3. ロジック

### 3.1 ルーティーンの展開（②）
- 表示期間 [from, to] の各日 d について、次の条件をすべて満たすルーティーンをその日に表示する
  - `start_date <= d`
  - `end_date is null or d <= end_date`
  - ルールに一致する
    - daily：毎日
    - weekly：`d` の曜日が `rule_days` に含まれる
    - monthly：`d` の日付が `rule_days` に含まれる（存在しない日付の月はスキップ。TODO-3）
    - weekdays：月〜金（祝日は考慮しない。TODO-2）
- 完了状態は `routine_logs` の (routine_id, date) から取得し、レコードがなければ未完了として扱う
- 完了操作をしたとき、初めて `routine_logs` に upsert する
- **繰り越しはしない**：過去の未完了はその日に未完了のまま表示される
- 展開処理は純粋関数 `expandRoutines(routines, logs, from, to)` として実装し、単体テストを書く

### 3.2 ルーティーンの編集
- タイトル・メモ・通知時刻だけを変える場合：そのまま更新する（過去の表示にも反映されてよい）
- ルール種別・曜日・開始日を変える場合：
  1. 既存ルーティーンの `end_date` を「昨日」にする
  2. 新しいルールで、`start_date = 今日` の新しいルーティーンを作成する
  3. 今日以降の `routine_logs` があれば新しいルーティーンに付け替える
- 削除：「今日以降を終了する（履歴は残す）」を標準にし、「完全に削除」は確認ダイアログを経て実行する

### 3.3 画像アップロード（①）
1. ファイルを選択する（`<input type="file" accept="image/*" multiple>`）
2. `createImageBitmap` で読み込み、長辺2048pxに縮小し、JPEG品質0.8で再エンコードする
3. Storageにアップロードしてから `attachments` に行を追加する
4. 失敗したら、アップロード済みのファイルを削除してエラーを表示する
- 1枚あたり、縮小後の目安は500KB以下

### 3.4 同期（③）
- 正となるデータはSupabaseのみ
- 起動時とフォアグラウンド復帰時にクエリを再取得する
- Supabase Realtime で tasks / routines / routine_logs / attachments の変更を購読し、該当するクエリを無効化する
- 競合は「後から保存したほうが勝ち」とする（個人利用のため許容する）
- 楽観的更新：完了チェックは即座に画面へ反映し、失敗したら元に戻してトーストを出す

### 3.5 オフライン（簡易版）
- Service Workerでアプリ本体（HTML / JS / CSS / アイコン）をキャッシュする
- TanStack Queryのキャッシュを IndexedDB に永続化し、オフラインでも直近のデータを閲覧できるようにする
- `navigator.onLine` と、リクエストの失敗を見てオフライン状態を判定する
- オフライン中は書き込み系の操作をすべて無効にする（キューに貯めて後で送る処理は作らない）

### 3.7 対応中（2026-11-11 追加）
- 対象：`done = false` かつ `date < 今日（JST）` の通常タスクすべて。ルーティーンは含めない（繰り越さない方針のまま）
- 何日もかかるタスクは、日付を開始日にして登録すれば、翌日から完了するまで「対応中」に出続ける
- 並び順：締め切りが近い順（締め切りなしは後ろ）→ 日付の古い順 → sort_order
- 完了チェックは1回だけ。完了すると帯から消え、元の日付の行に取り消し線付きで残る
- 元の日付の行にもそのまま表示する（帯は要約であり、日付の一覧からは消さない）。初期の期間は今日からなので、元の日付の行が見えるのは前の期間へ移動したとき
- 締め切りが明日以前（超過・今日まで・明日まで）のものは「今日」のセクションに出し、「対応中」からは外す（2026-11-12 追加）。今日を含まない期間を表示しているときは、すべて「対応中」に出す

### 3.6 通知
- 対象
  - 通常タスク：`remind_at` が設定されているもの
  - ルーティーン：`remind_time` が設定され、その日に展開されるもの
- 仕組み
  1. pg_cron で5分ごとに Edge Function `send-reminders` を呼ぶ
  2. 送信対象：`remind_at <= now()` かつ `notified_at is null` かつ未完了のタスク、および今日の `remind_time` を過ぎていて未完了・未通知のルーティーン
  3. VAPID鍵で Web Push を送信し、`notified_at` を記録する（ルーティーンは routine_logs に upsert）
  4. 送信先から 404 / 410 が返ったら、その購読を削除する
- 通知の精度は最大で約5分遅れる（仕様として許容する）
- 通知をタップしたら、そのタスクの詳細画面を開く
- iOSの条件：iOS 16.4以降、ホーム画面に追加したアプリからのみ購読できる。設定画面に案内文を出す

---

## 4. 非機能要件
- 一覧の初回表示：キャッシュがある場合は1秒以内
- アクセシビリティ：タップ領域は44pt以上、ダークモードに対応
- 秘密情報（VAPID秘密鍵、LLMのAPIキー）はSupabaseのSecretsにだけ置く。フロントエンドには置かない
- 日付の計算はすべてJSTで行う。`date` 型は文字列 `YYYY-MM-DD` として扱い、`Date` オブジェクトのタイムゾーン変換を挟まない

---

## 5. 開発フェーズと受け入れ条件

### Phase 1：基本機能＋詳細＋同期（①③）
- [ ] メールアドレスとパスワードでログインでき、ホーム画面アプリでもログインが保持される
- [ ] 一覧画面で期間の移動、「今日へ戻る」、「今日」のセクションの「＋」での追加ができる（2026-11-12 変更：日ごとの「＋」は廃止）
- [ ] 完了チェックで取り消し線が付き、もう一度押すと元に戻る
- [ ] 詳細画面でメモを編集し、日付を変更できる
- [ ] 画像を3枚添付でき、縮小後のサイズが1枚1MB未満である
- [ ] iPhoneで追加したタスクが、5秒以内にMacの画面へ反映される
- [ ] 機内モードで起動しても直近のデータが表示され、編集操作は無効になっている
- [ ] 別のユーザーのデータが読めないことをRLSのテストで確認する

### Phase 2：ルーティーン（②）
- [ ] 毎日・毎週（曜日指定）・毎月・平日のルーティーンを作成できる
- [ ] 該当日だけに展開され（今日と、前の期間の過去の日で確認）、日ごとに完了状態が独立している
- [ ] 昨日の未完了ルーティーンが今日に繰り越されない
- [ ] ルールを変更しても、昨日までの完了履歴が変わらない
- [ ] `expandRoutines` の単体テスト（月末、うるう年、開始日・終了日の境界）が通る

### Phase 2.1：対応中（2026-11-11 追加）
- [ ] 日付を過ぎた未完了のタスクが、表示期間に関係なく「対応中」に出る
- [ ] 未完了のルーティーンは「対応中」に出ない
- [ ] 締め切りを設定でき、日付より前の締め切りは保存できない（画面とDBの両方で拒否）
- [ ] 締め切りの近い順に並び、残り日数／超過日数が表示される
- [ ] 「対応中」で完了にすると帯から消え、元の日付の行は取り消し線付きになる
- [ ] 帯を折りたためる

### Phase 2.2：一覧を「今日」中心にする（2026-11-12 追加）
- [ ] 開くと「今日」のセクションが先頭に出て、その下に「対応中」（初期値は閉じる）と「これから」が続く
- [ ] 締め切りが明日以前の対応中タスクは「今日」に出て、「対応中」には重ねて出ない
- [ ] ルーティーンは「今日」では1行にまとまり、開くと個別に完了できる。「これから」には出ない
- [ ] 「これから」には通常タスクのある日だけが出る

### Phase 2.5：通知
- [ ] 設定画面から通知を許可でき、テスト通知が届く
- [ ] remind_at を設定したタスクの通知が、指定時刻から5分以内に届く
- [ ] ルーティーンの通知時刻に、未完了であれば通知が届き、完了済みであれば届かない
- [ ] 同じ通知が2回届かない

### Phase 3：AI秘書の接続口（MCP）（④、2026-11-11 変更）
旧 Phase 3（ショートカット用トークン）と旧 Phase 4（アプリ内でLLMを呼ぶAI秘書）を置き換える。
ChatGPT の「プラグイン」に自作のMCPサーバーとして登録し、ChatGPT の定期実行（スケジュール）からも使う。
LLMの費用はChatGPTの契約内で済み、アプリ側にLLMのAPIキーは置かない。

- 構成
  - Edge Function `mcp`：リモートMCPサーバー（Streamable HTTP、リクエストごとにサーバーを作るステートレス構成）
  - 認証：Supabase Auth の OAuth 2.1 サーバー（認可コード＋PKCE、動的クライアント登録）。署名鍵は非対称（ES256）
  - 同意画面：`https://hipchin.github.io/task-app/oauth/consent`（アプリ内。ログインしていなければ先にログイン）
  - ツールはユーザー本人のトークンで動き、RLS がそのまま効く
- ツール（削除系は用意しない）
  - 読む：`list_tasks(from, to)`（期間のタスクとルーティーン）、`list_open_tasks()`（対応中）、`list_routines()`
  - 書く：`add_task(title, date, due_date?, memo?)`、`set_task_done(id, done)`、`update_task(id, title?, date?, due_date?)`、`append_task_memo(id, text)`、`set_routine_done(routine_id, date, done)`
- 制限（DBで強制する。OAuthクライアントのトークンは JWT に `client_id` を持つ）
  - タスクの削除、ルーティーン本体の作成・変更・削除、画像・通知購読・トークンの操作はできない
  - 書き込みはすべて `agent_actions`（操作記録）に残す
- 設定画面
  - 「連携中のアプリ」：許可したアプリの一覧と「連携を解除」
  - 「AIの操作履歴」：直近20件
- 受け入れ条件
  - [x] ChatGPT にプラグインを追加でき、同意画面で許可すると接続できる（2026-11-11 実機）
  - [ ] ChatGPT から「明日の予定は？」で、明日のタスクとルーティーンを答える
  - [x] ChatGPT から「今日の未完了は？」で読み取れる（2026-11-11 実機）。「対応中は？」で、対応中のタスクを締め切りの近い順に答える
  - [x] ChatGPT からタスクを追加でき、一覧へ反映される（2026-11-11 実機。Plus で可）
  - [x] ChatGPT のトークンでは、タスクの削除やルーティーン本体の変更がDBで拒否される（E2E `mcp.spec.ts`）
  - [x] 書き込みが操作記録に残り、設定画面で見られる（E2E）
  - [x] 「連携を解除」すると、以後のツール呼び出しが拒否される（E2E）
  - [ ] ChatGPT の定期実行から呼び出せる（しばらく運用してから試す）

### Phase 4：（旧ショートカット連携）
- 必要になったら、Phase 3 の MCP とは別に検討する

## 6. ディレクトリ構成（案）

```
task-app/
  CLAUDE.md
  docs/SPEC.md
  web/                      # React PWA
    src/
      features/tasks/
      features/routines/
      features/attachments/
      features/settings/
      lib/supabase.ts
      lib/date.ts           # JSTの日付ユーティリティ
      lib/expandRoutines.ts
    public/manifest.webmanifest
  supabase/
    migrations/
    functions/
      send-reminders/
      quick-add/
      assistant/
```
