import { sql } from 'drizzle-orm'
import { db } from '@miro/db'

/**
 * 남성향 퍼널(11/8). 단계마다 기간 안의 고유 사용자 수. 홈 방문·언베일만 analytics_events 이벤트이고,
 * 나머지는 각 표에 이미 남는 시각을 읽는다. 운영자(admin_users 와 이메일이 같은 계정)는 뺀다.
 */
export async function funnel(days: number) {
  const since = sql`now() - make_interval(days => ${days})`
  // 운영자 계정 = 관리자 이메일과 같은 계정 + MIRO_OPERATOR_EMAILS(쉼표 구분, 없으면 관리자 이메일만).
  const testers = (process.env.MIRO_OPERATOR_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const ops = sql`(select u.id from public.users u where lower(u.email) in (select lower(email) from admin_users)
    or lower(u.email) = any(${`{${testers.map(t => `"${t.replace(/"/g, '')}"`).join(',')}}`}::text[]))`
  const male = sql`join characters c on c.id = s.character_id and c.audience = 'male'`
  const [steps] = await db.execute(sql`select
    (select count(distinct props->>'anonId') from analytics_events where event = 'home_viewed' and created_at > ${since} and (user_id is null or user_id not in ${ops}))::int as visit,
    (select count(*) from public.users where created_at > ${since} and deleted_at is null and exists (select 1 from terms_consents tc where tc.user_id = public.users.id) and id not in ${ops})::int as signup,
    (select count(distinct s.user_id) from roleplay_sessions s ${male} where s.created_at > ${since} and s.user_id not in ${ops})::int as started,
    (select count(distinct s.user_id) from roleplay_sessions s ${male} where s.created_at > ${since} and s.turn_count >= 5 and s.user_id not in ${ops})::int as turn5,
    (select count(*) from public.users where adult_verified_at > ${since} and deleted_at is null and id not in ${ops})::int as verified,
    (select count(distinct user_id) from analytics_events where event = 'unveil_enabled' and created_at > ${since} and user_id not in ${ops})::int as unveil,
    (select count(distinct s.user_id) from generated_media g join roleplay_sessions s on s.id = g.session_id where g.created_at > ${since} and s.user_id not in ${ops})::int as photo,
    (select count(distinct user_id) from bank_transfer_orders where created_at > ${since} and user_id not in ${ops})::int as requested,
    (select count(distinct user_id) from bank_transfer_orders where created_at > ${since} and status = 'approved' and user_id not in ${ops})::int as approved,
    (select round(100.0 * count(*) filter (where status in ('expired', 'rejected')) / nullif(count(*) filter (where status <> 'awaiting'), 0))::int
       from bank_transfer_orders where created_at > ${since} and user_id not in ${ops}) as unpaid_pct,
    (select round(extract(epoch from percentile_cont(0.5) within group (order by decided_at - created_at)) / 60)::int
       from bank_transfer_orders where created_at > ${since} and status = 'approved' and decided_at is not null and user_id not in ${ops}) as wait_min`)
  const works = await db.execute(sql`select c.name,
      count(distinct s.user_id)::int as started,
      count(distinct s.user_id) filter (where s.turn_count >= 5)::int as turn5,
      (select count(distinct e.user_id) from analytics_events e where e.event = 'unveil_enabled' and e.props->>'characterId' = c.id::text and e.created_at > ${since} and e.user_id not in ${ops})::int as unveil,
      (select count(distinct s2.user_id) from generated_media g join roleplay_sessions s2 on s2.id = g.session_id where g.character_id = c.id and g.created_at > ${since} and s2.user_id not in ${ops})::int as photo
    from roleplay_sessions s ${male}
    where s.created_at > ${since} and s.user_id not in ${ops}
    group by c.id, c.name order by started desc, turn5 desc limit 40`)
  // 유입 경로별(11/12) — 홍보 링크의 utm_source 로 들어온 익명 ID, 그 익명 ID 가 로그인한 뒤 남긴 방문으로 계정을 잇는다.
  const sources = await db.execute(sql`with src as (
      select distinct props->>'src' as src, props->>'anonId' as anon from analytics_events
      where event = 'home_viewed' and created_at > ${since} and props->>'src' is not null and (user_id is null or user_id not in ${ops})),
    linked as (
      select distinct s.src, e.user_id from src s join analytics_events e
        on e.event = 'home_viewed' and e.props->>'anonId' = s.anon and e.user_id is not null and e.user_id not in ${ops})
    select s.src, count(distinct s.anon)::int as visit,
      (select count(distinct l.user_id) from linked l join public.users u on u.id = l.user_id
        where l.src = s.src and u.created_at > ${since} and u.deleted_at is null and exists (select 1 from terms_consents tc where tc.user_id = u.id))::int as signup,
      (select count(distinct l.user_id) from linked l join roleplay_sessions r on r.user_id = l.user_id
        where l.src = s.src and r.created_at > ${since} and r.turn_count >= 5)::int as turn5
    from src s group by s.src order by visit desc limit 20`)
  return {
    steps: steps as Record<string, number | null>,
    works: [...works] as Array<{ name: string; started: number; turn5: number; unveil: number; photo: number }>,
    sources: [...sources] as Array<{ src: string; visit: number; signup: number; turn5: number }>,
  }
}
