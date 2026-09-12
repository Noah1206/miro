import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
import { resolveAdultVerification, resolveCallMedia, resolveImage, resolveLLM, resolvePush } from '@miro/providers'

/** 운영 상태. Provider 가 Mock 이면 그대로 드러난다 — 실제 AI 처럼 위장하지 않는다. */
export async function GET() {
  let dbState: 'up' | 'down' = 'up'
  try { await db.execute(sql`select 1`) } catch { dbState = 'down' }
  const body = {
    ok: dbState === 'up',
    db: dbState,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    providers: {
      llm: resolveLLM().info.mode, image: resolveImage().info.mode, push: resolvePush().info.mode,
      voice: resolveCallMedia('voice').info.mode, video: resolveCallMedia('video').info.mode,
      adultVerification: resolveAdultVerification().info.mode,
    },
  }
  return NextResponse.json(body, { status: body.ok ? 200 : 503 })
}
