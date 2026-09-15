import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
import { currentMode, features, productionRuntime } from '@miro/config'
import { aiReadiness, resolveAdultVerification, resolveCallMedia, resolveImage, resolveLLM, resolvePush } from '@miro/providers'

/** 운영 상태. Provider 가 Mock 이면 그대로 드러난다 — 실제 AI 처럼 위장하지 않는다. */
export async function GET() {
  let dbState: 'up' | 'down' = 'up'
  try { await db.execute(sql`select 1`) } catch { dbState = 'down' }
  const ai = aiReadiness()
  let llm = { mode: 'unavailable', name: 'unconfigured' }
  try { llm = resolveLLM().info } catch { /* readiness reports the configuration error without a stack */ }
  const body = {
    ok: dbState === 'up' && (!productionRuntime() || ai.ready),
    ai,
    db: dbState,
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
