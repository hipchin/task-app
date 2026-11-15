-- AI が同じ出どころ（例：同じメール）から二重にタスクを作らないための識別子（SPEC Phase 3、2026-11-15）
-- 重複の判定を AI の注意力に任せず、DB の一意制約で拒否する。
-- 本人が画面から作るタスクは null のまま（一意制約は null を対象にしない）。
alter table public.tasks add column source_key text
  check (source_key is null or char_length(source_key) between 1 and 200);
create unique index tasks_user_source_key_idx on public.tasks (user_id, source_key)
  where source_key is not null;

-- OAuth クライアントは、作るときにだけ source_key を付けられる（あとから付け替え・外すことはできない）
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
     or new.created_at is distinct from old.created_at
     or new.source_key is distinct from old.source_key then
    raise exception 'AI からは変更できない項目です' using errcode = '42501';
  end if;
  if new.memo is distinct from old.memo
     and left(new.memo, char_length(old.memo)) is distinct from old.memo then
    raise exception 'AI からはメモを書き換えられません（追記のみ）' using errcode = '42501';
  end if;
  return new;
end;
$$;
