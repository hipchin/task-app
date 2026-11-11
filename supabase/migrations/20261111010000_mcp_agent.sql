-- AI秘書の接続口（MCP / OAuth 2.1）向けの制限と操作記録（SPEC Phase 3）
-- OAuth クライアント（ChatGPT など）のアクセストークンは JWT に client_id を持つ。
-- 本人の画面からのセッションには client_id がない。

create or replace function public.is_oauth_client() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'client_id') is not null, false)
$$;

-- ---------------------------------------------------------------------------
-- OAuth クライアントに許さない操作（RESTRICTIVE：既存の本人用ポリシーに AND で効く）
-- ---------------------------------------------------------------------------
-- タスクの削除
create policy tasks_no_oauth_delete on public.tasks as restrictive for delete to authenticated
  using (not (select public.is_oauth_client()));

-- ルーティーン本体の作成・変更・削除（読むのは可）
create policy routines_no_oauth_insert on public.routines as restrictive for insert to authenticated
  with check (not (select public.is_oauth_client()));
create policy routines_no_oauth_update on public.routines as restrictive for update to authenticated
  using (not (select public.is_oauth_client()));
create policy routines_no_oauth_delete on public.routines as restrictive for delete to authenticated
  using (not (select public.is_oauth_client()));

-- ルーティーンの記録の削除（完了・未完了の記録は可）
create policy routine_logs_no_oauth_delete on public.routine_logs as restrictive for delete to authenticated
  using (not (select public.is_oauth_client()));

-- 画像・通知購読・トークンは一切触らせない
create policy attachments_no_oauth on public.attachments as restrictive for all to authenticated
  using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()));
create policy push_subscriptions_no_oauth on public.push_subscriptions as restrictive for all to authenticated
  using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()));
create policy api_tokens_no_oauth on public.api_tokens as restrictive for all to authenticated
  using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()));
create policy storage_attachments_no_oauth on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'attachments' or not (select public.is_oauth_client()))
  with check (bucket_id <> 'attachments' or not (select public.is_oauth_client()));

-- ---------------------------------------------------------------------------
-- 操作記録（追記のみ。変更・削除はできない）
-- ---------------------------------------------------------------------------
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id text,
  action text not null check (char_length(action) between 1 and 50),
  target_id uuid,
  summary text not null check (char_length(summary) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index agent_actions_user_created_idx on public.agent_actions (user_id, created_at desc);

-- user_id と client_id は呼び出し元のトークンから必ず決める（偽れない）
create or replace function public.agent_actions_fill() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.client_id := auth.jwt() ->> 'client_id';
  new.created_at := now();
  return new;
end;
$$;
create trigger agent_actions_fill before insert on public.agent_actions
  for each row execute function public.agent_actions_fill();

revoke all on public.agent_actions from anon, authenticated;
grant select, insert on public.agent_actions to authenticated;
alter table public.agent_actions enable row level security;
create policy agent_actions_select on public.agent_actions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy agent_actions_insert on public.agent_actions for insert to authenticated
  with check ((select auth.uid()) = user_id);
