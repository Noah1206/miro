import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'

/**
 * 알파 퍼널 숫자. 대시보드 대신 JSON 한 장 — `Authorization: Bearer $CRON_SECRET` 로 연다.
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/alpha/stats
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [funnel, sessions, waitlist, calls] = await Promise.all([
    db.execute(sql`select event, count(distinct props->>'alphaSession') as sessions, count(*) as events
                   from analytics_events where user_id is null and props ? 'alphaSession' group by event order by event`),
    db.execute(sql`select count(*)::int as sessions,
                          round(avg(extract(epoch from (last_seen_at - created_at))))::int as avg_duration_sec,
                          round(avg(user_messages), 1)::float as avg_messages,
                          count(*) filter (where user_messages >= 3)::int as reached_3_messages,
                          count(*) filter (where wow_at is not null)::int as wow,
                          count(*) filter (where reality_at is not null)::int as reality,
                          count(*) filter (where cliff_at is not null)::int as cliffhanger
                   from alpha_sessions`),
    db.execute(sql`select count(*)::int as n from alpha_waitlist`),
    db.execute(sql`select count(*)::int as today from alpha_ai_calls where created_at >= (now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul'`),
  ])
  return NextResponse.json({
    funnel: [...funnel], sessions: sessions[0], waitlist: waitlist[0], aiCalls: calls[0],
    limits: { user: process.env.USER_DAILY_MESSAGE_LIMIT ?? '15 (default)', global: process.env.DAILY_AI_REQUEST_LIMIT ?? '300 (default)' },
  })
}
