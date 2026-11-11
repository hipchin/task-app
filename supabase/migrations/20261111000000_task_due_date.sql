-- 締め切り（任意）。期間のあるタスクでは date を開始日、due_date を締め切りとする（SPEC §2 / §3.7）
alter table public.tasks
  add column due_date date,
  add constraint tasks_due_after_date check (due_date is null or due_date >= date);

-- 「対応中」（未完了で日付を過ぎたもの）を引くための索引
create index tasks_user_open_idx on public.tasks (user_id, date) where not done;

-- 権限と RLS は tasks の既存の設定（本人の行のみ・操作ごと）がそのまま適用される
