import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
import { currentMode, features, productionRuntime } from '@miro/config'
import { aiReadiness, resolveAdultVerification, resolveCallMedia, resolveImage, resolveLLM, resolvePush } from '@miro/providers'

/** 운영 상태. Provider 가 Mock 이면 그대로 드러난다 — 실제 AI 처럼 위장하지 않는다. */
export async function GET() {
  let dbState: 'up' | 'down' = 'up'
  try { await db.execute(sql`select 1`) } catch { dbState = 'down' }
  // 스키마 → 코드 순서(agency-core-transition-plan §6.1)가 지켜졌는지. 'behind' 면 이 코드는 채팅·커밋에서 실패한다 — 마이그레이션부터.
  let schema: 'ready' | 'behind' | 'unknown' = 'unknown'
  try {
    const rows = await db.execute<{ ok: boolean }>(sql`select to_regclass('public.state_transitions') is not null and to_regclass('public.memory_jobs') is not null
      and exists (select 1 from information_schema.columns where table_name = 'roleplay_sessions' and column_name = 'policy_version')
      and exists (select 1 from information_schema.columns where table_name = 'ai_usage' and column_name = 'origin') as ok`)
    schema = (rows[0] as { ok: boolean } | undefined)?.ok ? 'ready' : 'behind'
  } catch { schema = 'unknown' }
  const ai = aiReadiness()
  let llm = { mode: 'unavailable', name: 'unconfigured' }
  try { llm = resolveLLM().info } catch { /* readiness reports the configuration error without a stack */ }
  const body = {
    ok: dbState === 'up' && schema !== 'behind' && (!productionRuntime() || ai.ready),
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
  return NextResponse.json(body, { status: body.ok ? 200 : 503 })
}
