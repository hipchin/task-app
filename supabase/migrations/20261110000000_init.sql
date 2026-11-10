-- 初期スキーマ（docs/SPEC.md §2）
-- すべてのテーブルは user_id = auth.uid() の行だけを操作できる。anon には一切の権限を与えない。

-- ---------------------------------------------------------------------------
-- 共通：updated_at の自動更新
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 通常タスク
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  memo text not null default '' check (char_length(memo) <= 20000),
  date date not null,
  done boolean not null default false,
  done_at timestamptz,
  sort_order double precision not null default 0,
  remind_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_date_idx on public.tasks (user_id, date);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ルーティーン
-- ---------------------------------------------------------------------------
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  memo text not null default '' check (char_length(memo) <= 20000),
  rule_type text not null check (rule_type in ('daily','weekly','monthly','weekdays')),
  rule_days int[],
  start_date date not null,
  end_date date,
  remind_time time,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date - 1)
);
create index routines_user_idx on public.routines (user_id);
create trigger routines_set_updated_at before update on public.routines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ルーティーンの日別記録
-- ---------------------------------------------------------------------------
create table public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  routine_id uuid not null references public.routines on delete cascade,
  date date not null,
  done boolean not null default false,
  memo text not null default '' check (char_length(memo) <= 20000),
  notified_at timestamptz,
  unique (routine_id, date)
);
create index routine_logs_user_date_idx on public.routine_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- 添付画像
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid references public.tasks on delete cascade,
  routine_log_id uuid references public.routine_logs on delete cascade,
  storage_path text not null,
  width int, height int,
  created_at timestamptz not null default now(),
  check (num_nonnulls(task_id, routine_log_id) = 1)
);
create index attachments_task_idx on public.attachments (task_id);
create index attachments_routine_log_idx on public.attachments (routine_log_id);
create index attachments_user_idx on public.attachments (user_id);

-- ---------------------------------------------------------------------------
-- Web Push 購読（Phase 2.5 で使用）
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ショートカット用トークン（Phase 3 で使用）
-- ---------------------------------------------------------------------------
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  token_hash text not null unique,
  label text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 権限：anon は何もできない。authenticated は RLS の範囲内で操作できる
-- ---------------------------------------------------------------------------
revoke all on public.tasks, public.routines, public.routine_logs, public.attachments,
  public.push_subscriptions, public.api_tokens from anon;
grant select, insert, update, delete on public.tasks, public.routines, public.routine_logs,
  public.attachments, public.push_subscriptions to authenticated;
-- api_tokens：ハッシュはクライアントから読ませない（発行・照合は Phase 3 の Edge Function で行う）
revoke all on public.api_tokens from authenticated;
grant select (id, user_id, label, revoked_at, created_at) on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;

alter table public.tasks enable row level security;
alter table public.routines enable row level security;
alter table public.routine_logs enable row level security;
alter table public.attachments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.api_tokens enable row level security;

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

-- routines
create policy routines_select on public.routines for select to authenticated
  using (user_id = (select auth.uid()));
create policy routines_insert on public.routines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy routines_update on public.routines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routines_delete on public.routines for delete to authenticated
  using (user_id = (select auth.uid()));

-- routine_logs：参照先のルーティーンも本人のものに限る
create policy routine_logs_select on public.routine_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_logs_insert on public.routine_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid()))
  );
create policy routine_logs_update on public.routine_logs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid()))
  );
create policy routine_logs_delete on public.routine_logs for delete to authenticated
  using (user_id = (select auth.uid()));

-- attachments：参照先と Storage パスも本人のものに限る
create policy attachments_select on public.attachments for select to authenticated
  using (user_id = (select auth.uid()));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and storage_path like (select auth.uid())::text || '/%'
    and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())))
    and (routine_log_id is null or exists (select 1 from public.routine_logs l where l.id = routine_log_id and l.user_id = (select auth.uid())))
  );
create policy attachments_delete on public.attachments for delete to authenticated
  using (user_id = (select auth.uid()));
-- 添付は作成と削除のみ（更新ポリシーなし＝更新不可）

-- push_subscriptions
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy push_subscriptions_update on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- api_tokens（閲覧と失効のみ。発行は Phase 3 の Edge Function）
create policy api_tokens_select on public.api_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy api_tokens_update on public.api_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime（SPEC §3.4）
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.tasks, public.routines,
  public.routine_logs, public.attachments;

-- ---------------------------------------------------------------------------
-- Storage：非公開バケット attachments。パスの先頭が auth.uid() のものだけ
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy attachments_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
