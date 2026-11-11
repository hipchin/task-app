-- セキュリティ診断（authenticated_security_definer_function_executable）対応
-- oauth_session_active() は RLS から使うために authenticated が実行できる必要があるが、
-- API（/rest/v1/rpc）から呼べる public スキーマに置かない。API に公開しない private スキーマへ移す。
-- ポリシーは関数を OID で参照しているので、移した後もそのまま効く。
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.oauth_session_active() set schema private;
