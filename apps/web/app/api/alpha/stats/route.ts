import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
import { BUDGET } from '@/lib/usage/ai-usage'

/**
 * 알파 퍼널 숫자. 대시보드 대신 JSON 한 장 — `Authorization: Bearer $CRON_SECRET` 로 연다.
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/alpha/stats
 * 게스트 계정(users.is_guest)의 정식 세션·정식 usage 표에서 센다 — 알파 전용 표는 없다.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [funnel, sessions, waitlist, ai] = await Promise.all([
    db.execute(sql`select event, count(distinct user_id) as users, count(*) as events
                   from analytics_events where props->>'alpha' = 'true' group by event order by event`),
    db.execute(sql`select count(*)::int as sessions,
                          round(avg(extract(epoch from (s.last_interaction_at - s.created_at))))::int as avg_duration_sec,
                          round(avg(s.turn_count), 1)::float as avg_messages,
                          count(*) filter (where s.turn_count >= 3)::int as reached_3_messages,
                          count(*) filter (where s.character_state->>'firedRules' like '%jealousy_spike%')::int as wow,
                          count(*) filter (where exists (select 1 from reality_contacts rc where rc.session_id = s.id and rc.status = 'sent'))::int as reality
                   from roleplay_sessions s join users u on u.id = s.user_id and u.is_guest`),
    db.execute(sql`select count(*)::int as n from alpha_waitlist`),
    db.execute(sql`select count(*)::int as calls_today, coalesce(sum(estimated_cost), 0)::float as cost_today,
                          count(*) filter (where not ok)::int as failed_today
                   from ai_usage where created_at >= (now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul'`),
  ])
  return NextResponse.json({
    funnel: [...funnel], sessions: sessions[0], waitlist: waitlist[0], ai: ai[0],
    budget: { userPerDay: BUDGET.userPerDay(), globalRequestsPerDay: BUDGET.globalRequestsPerDay(), globalCostPerDay: BUDGET.globalCostPerDay(), ipPerMinute: BUDGET.ipPerMinute() },
  })
}
