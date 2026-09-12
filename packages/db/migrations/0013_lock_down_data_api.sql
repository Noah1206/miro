-- MIRO 는 Next.js 서버만 DB 에 접속한다 (Drizzle + postgres-js, DATABASE_URL).
-- 브라우저는 Supabase Data API 를 쓰지 않으므로 anon/authenticated 에게 줄 권한이 없다.
-- Supabase 는 public 스키마를 기본으로 노출하므로, 그대로 두면 publishable key 하나로
-- auth_sessions(로그인 토큰)과 admin_users(비밀번호 해시)까지 읽고 쓸 수 있다.
-- 로컬 Postgres 에는 이 역할들이 없으므로 전부 조건부로 실행한다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    revoke usage on schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end $$;

-- 심층 방어로 RLS 를 켠다. 정책을 만들지 않으므로 위 두 역할에는 어떤 행도 보이지 않는다.
-- 앱이 쓰는 연결 역할은 테이블 소유자라 RLS 를 우회한다 — 서버 동작에는 영향이 없다.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
