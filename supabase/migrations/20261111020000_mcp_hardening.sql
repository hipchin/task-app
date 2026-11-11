-- MCP 連携の強化（2026-11-11 レビュー対応。SPEC Phase 3）
--  1. OAuth クライアントは、連携を解除した時点で REST からも使えなくする（セッションの存在を確認）
--  2. OAuth クライアントの書き込みは、MCP のツールで許した範囲の列だけ（メモは追記のみ）
--  3. 操作記録は DB の変更から自動で作る（クライアントは直接書けない）
--  4. メモの追記を原子的に行う関数

-- ---------------------------------------------------------------------------
-- 1. セッションが生きているか（OAuth クライアントのときだけ確認する）
--    auth.sessions は authenticated から読めないので SECURITY DEFINER。返すのは真偽値だけ
-- ---------------------------------------------------------------------------
create or replace function public.oauth_session_active() returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select case
    when (auth.jwt() ->> 'client_id') is null then true
    else exists (
      select 1 from auth.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = auth.uid()
    )
  end
$$;
revoke all on function public.oauth_session_active() from public, anon;
grant execute on function public.oauth_session_active() to authenticated;

create policy tasks_oauth_session on public.tasks as restrictive for all to authenticated
  using ((select public.oauth_session_active())) with check ((select public.oauth_session_active()));
create policy routines_oauth_session on public.routines as restrictive for all to authenticated
  using ((select public.oauth_session_active())) with check ((select public.oauth_session_active()));
create policy routine_logs_oauth_session on public.routine_logs as restrictive for all to authenticated
  using ((select public.oauth_session_active())) with check ((select public.oauth_session_active()));
create policy agent_actions_oauth_session on public.agent_actions as restrictive for all to authenticated
  using ((select public.oauth_session_active())) with check ((select public.oauth_session_active()));

-- ---------------------------------------------------------------------------
-- 2. OAuth クライアントが変えてよい列
-- ---------------------------------------------------------------------------
create or replace function public.tasks_oauth_guard() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not public.is_oauth_client() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.remind_at is not null or new.notified_at is not null or new.done then
      raise exception 'AI からは通知の設定や完了済みのタスクを作れません' using errcode = '42501';
    end if;
    return new;
  end if;
  -- UPDATE：タイトル・日付・締め切り・完了・メモの追記だけ
  if new.remind_at is distinct from old.remind_at
     or new.notified_at is distinct from old.notified_at
     or new.sort_order is distinct from old.sort_order
     or new.created_at is distinct from old.created_at then
    raise exception 'AI からは変更できない項目です' using errcode = '42501';
  end if;
  if new.memo is distinct from old.memo
     and left(new.memo, char_length(old.memo)) is distinct from old.memo then
    raise exception 'AI からはメモを書き換えられません（追記のみ）' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_oauth_guard before insert or update on public.tasks
  for each row execute function public.tasks_oauth_guard();

create or replace function public.routine_logs_oauth_guard() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not public.is_oauth_client() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.memo <> '' or new.notified_at is not null then
      raise exception 'AI からはルーティーンの完了だけ記録できます' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.routine_id is distinct from old.routine_id
     or new.date is distinct from old.date
     or new.memo is distinct from old.memo
     or new.notified_at is distinct from old.notified_at then
    raise exception 'AI からはルーティーンの完了だけ変更できます' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger routine_logs_oauth_guard before insert or update on public.routine_logs
  for each row execute function public.routine_logs_oauth_guard();

-- ---------------------------------------------------------------------------
-- 3. 操作記録は DB の変更から自動で作る
-- ---------------------------------------------------------------------------
drop policy agent_actions_insert on public.agent_actions;
revoke insert on public.agent_actions from authenticated;

-- 書き込みは SECURITY DEFINER の記録用関数からだけ（user_id / client_id は既存のトリガーがトークンから決める）
create or replace function public.record_agent_action(p_action text, p_target uuid, p_summary text) returns void
  language sql security definer
  set search_path = ''
as $$
  insert into public.agent_actions (action, target_id, summary)
  values (p_action, p_target, left(p_summary, 1000));
$$;
revoke all on function public.record_agent_action(text, uuid, text) from public, anon, authenticated;

create or replace function public.tasks_audit() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  parts text[] := '{}';
begin
  if not public.is_oauth_client() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.record_agent_action('add_task', new.id, format('「%s」を %s に追加', new.title, new.date));
    return null;
  end if;
  if new.done is distinct from old.done then
    parts := parts || (case when new.done then '完了にした' else '未完了に戻した' end);
  end if;
  if new.title is distinct from old.title then
    parts := parts || format('タイトルを「%s」に変更', new.title);
  end if;
  if new.date is distinct from old.date then
    parts := parts || format('日付を %s に変更', new.date);
  end if;
  if new.due_date is distinct from old.due_date then
    parts := parts || format('締め切りを %s に変更', coalesce(new.due_date::text, 'なし'));
  end if;
  if new.memo is distinct from old.memo then
    parts := parts || format('メモに追記：%s', btrim(substr(new.memo, char_length(old.memo) + 1)));
  end if;
  if array_length(parts, 1) is not null then
    perform public.record_agent_action('update_task', new.id, format('「%s」の%s', old.title, array_to_string(parts, '、')));
  end if;
  return null;
end;
$$;
create trigger tasks_audit after insert or update on public.tasks
  for each row execute function public.tasks_audit();

create or replace function public.routine_logs_audit() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  t text;
begin
  if not public.is_oauth_client() then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.done is not distinct from old.done then
    return null;
  end if;
  select r.title into t from public.routines r where r.id = new.routine_id and r.user_id = new.user_id;
  perform public.record_agent_action(
    'set_routine_done', new.routine_id,
    format('ルーティーン「%s」の %s を%s', coalesce(t, '?'), new.date, case when new.done then '完了にした' else '未完了にした' end)
  );
  return null;
end;
$$;
create trigger routine_logs_audit after insert or update on public.routine_logs
  for each row execute function public.routine_logs_audit();

revoke all on function public.tasks_audit() from public, anon, authenticated;
revoke all on function public.routine_logs_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. メモの追記（1回の UPDATE で行うので、同時に追記しても消えない）。呼び出し元の権限で動き RLS が効く
-- ---------------------------------------------------------------------------
create or replace function public.append_task_memo(p_task_id uuid, p_text text) returns setof public.tasks
  language sql security invoker
  set search_path = ''
as $$
  update public.tasks
     set memo = case when memo = '' then p_text else memo || E'\n\n' || p_text end
   where id = p_task_id
  returning *;
$$;
revoke all on function public.append_task_memo(uuid, text) from public, anon;
grant execute on function public.append_task_memo(uuid, text) to authenticated;
