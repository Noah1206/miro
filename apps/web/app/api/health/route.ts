import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
import { currentMode, features, productionRuntime } from '@miro/config'
import { aiReadiness, resolveAdultVerification, resolveCallMedia, resolveImage, resolveLLM, resolvePush } from '@miro/providers'

/**
 * 운영 상태. Provider 가 Mock 이면 그대로 드러난다 — 실제 AI 처럼 위장하지 않는다.
 * 공개 응답은 정상 여부만(ok·db·schema·cron) — 기능·공급자 구성은 CRON_SECRET 이 있을 때만(10/3 점검: 운영 구성 노출).
 * 운영에서 크론(정리·AI 판단)이 45분 넘게 안 돌면 ok=false·503 — 외부 감시가 이 주소만 보면 크론 멈춤도 잡는다.
 */
export async function GET(req: Request) {
  let dbState: 'up' | 'down' = 'up'
  try { await db.execute(sql`select 1`) } catch { dbState = 'down' }
  // 스키마 → 코드 순서(agency-core-transition-plan §6.1)가 지켜졌는지. 'behind' 면 이 코드는 채팅·커밋에서 실패한다 — 마이그레이션부터.
  let schema: 'ready' | 'behind' | 'unknown' = 'unknown'
  try {
    const rows = await db.execute<{ ok: boolean }>(sql`select to_regclass('public.state_transitions') is not null and to_regclass('public.memory_jobs') is not null
      and exists (select 1 from information_schema.columns where table_name = 'roleplay_sessions' and column_name = 'policy_version')
      and exists (select 1 from information_schema.columns where table_name = 'ai_usage' and column_name = 'origin')
      and exists (select 1 from information_schema.columns where table_name = 'characters' and column_name = 'relationship_profile')
      and to_regclass('public.user_personas') is not null
      and exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'tastes')
      and exists (select 1 from information_schema.columns where table_name = 'user_settings' and column_name = 'night_marketing_consent_at')
      and to_regclass('public.character_life_events') is not null
      and exists (select 1 from information_schema.columns where table_name = 'character_runtime_states' and column_name = 'life_until')
      and exists (select 1 from information_schema.columns where table_name = 'roleplay_sessions' and column_name = 'adult_since')
      and to_regclass('public.ops_heartbeats') is not null as ok`)
    schema = (rows[0] as { ok: boolean } | undefined)?.ok ? 'ready' : 'behind'
  } catch { schema = 'unknown' }
  let cron: 'fresh' | 'stale' | 'unknown' = 'unknown'
  try {
    const [row] = await db.execute<{ age: number | null }>(sql`select extract(epoch from now() - min(at))::float as age from ops_heartbeats where name in ('maintenance', 'ai')`)
    const age = (row as { age: number | null } | undefined)?.age
    if (age !== null && age !== undefined) cron = age < 45 * 60 ? 'fresh' : 'stale'
  } catch { cron = 'unknown' }
  const ai = aiReadiness()
  let llm = { mode: 'unavailable', name: 'unconfigured' }
  try { llm = resolveLLM().info } catch { /* readiness reports the configuration error without a stack */ }
  const body = {
    ok: dbState === 'up' && schema !== 'behind' && (!productionRuntime() || (ai.ready && cron !== 'stale')),
    cron,
    ai,
    db: dbState,
    schema,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    mode: currentMode(),
    features: features(),
    providers: {
      llm: llm.mode, llmChain: llm.name, image: resolveImage().info.mode, push: resolvePush().info.mode,
      voice: resolveCallMedia('voice').info.mode, video: resolveCallMedia('video').info.mode,
      adultVerification: resolveAdultVerification().info.mode,
    },
  }
  const secret = process.env.CRON_SECRET
  const detailed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const status = body.ok ? 200 : 503
  return NextResponse.json(detailed ? body : { ok: body.ok, db: body.db, schema: body.schema, cron: body.cron, version: body.version }, { status })
}
