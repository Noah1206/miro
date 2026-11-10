import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth'
import { runStoryTurn } from '@/lib/stories/turn'
import { definitionOf, runFor } from '@/lib/stories/repo'
import { runView } from '@/lib/stories/view'
import type { StoryState } from '@miro/domain'

const Body = z.object({ runId: z.string().uuid(), clientTurnId: z.string().min(8).max(80), text: z.string().min(1).max(1000),
  channel: z.enum(['scene', 'dm']), thread: z.string().max(10).nullable().optional() })

/** 스토리 한 턴. 같은 clientTurnId 로 다시 보내면 저장된 결과를 그대로 돌려준다(재시도·새로고침). */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const out = await runStoryTurn({ userId: user.id, ...parsed.data })
  if (out.status !== 'done') {
    const code = out.status === 'not_found' ? 404 : out.status === 'busy' || out.status === 'conflict' ? 409 : out.status === 'invalid' ? 400 : 502
    return NextResponse.json({ error: out.error, status: out.status }, { status: code, headers: { 'cache-control': 'no-store' } })
  }
  const run = await runFor(user.id, parsed.data.runId)
  const view = run ? runView(await definitionOf(run.storyId), run.state as StoryState) : null
  // 거부 이유의 행동 원문(모델 제안)은 화면에 보내지 않는다 — 장면이 설명한다.
  return NextResponse.json({ messages: out.messages, ended: out.ended, cached: out.cached, view }, { headers: { 'cache-control': 'no-store' } })
}
