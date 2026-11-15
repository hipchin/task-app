-- AI がタスクに添付した画像を「見る」ことだけ許す（SPEC Phase 3、2026-11-15）
-- これまでは OAuth クライアントに画像を一切触らせていなかった。
-- 必要な会話だけスクリーンショットにしてタスクへ添付し、AI に読ませる使い方のため、読み取りだけ開ける。
-- 追加・変更・削除は引き続き拒否する。連携を解除したら読めなくなる。

-- 添付の行：読み取り以外を拒否
drop policy attachments_no_oauth on public.attachments;
create policy attachments_no_oauth_insert on public.attachments as restrictive for insert to authenticated
  with check (not (select public.is_oauth_client()));
create policy attachments_no_oauth_update on public.attachments as restrictive for update to authenticated
  using (not (select public.is_oauth_client()));
create policy attachments_no_oauth_delete on public.attachments as restrictive for delete to authenticated
  using (not (select public.is_oauth_client()));
create policy attachments_oauth_session on public.attachments as restrictive for all to authenticated
  using ((select private.oauth_session_active())) with check ((select private.oauth_session_active()));

-- 画像ファイル（Storage）：読み取り以外を拒否
drop policy storage_attachments_no_oauth on storage.objects;
create policy storage_attachments_no_oauth_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'attachments' or not (select public.is_oauth_client()));
create policy storage_attachments_no_oauth_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'attachments' or not (select public.is_oauth_client()));
create policy storage_attachments_no_oauth_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'attachments' or not (select public.is_oauth_client()));
create policy storage_attachments_oauth_session on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'attachments' or (select private.oauth_session_active()))
  with check (bucket_id <> 'attachments' or (select private.oauth_session_active()));
