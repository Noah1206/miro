import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { NovelError, resetNovel, writeNextChapter } from '@/lib/novel'
import { UsageExceededError } from '@/lib/usage/guard'
import { observe } from '@/lib/observe'

export const runtime = 'nodejs'
// 한 화 쓰는 데 1~2분 — 화면이 다 될 때까지 한 화씩 다시 부른다(11/9).
export const maxDuration = 300

/** 다음 한 화를 쓴다. body { reset: true } 면 지우고 1화부터. 잔액이 모자라면 대화와 같은 { limit: 'user' } 로 충전 시트를 연다. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const body = await req.json().catch(() => ({})) as { reset?: boolean }
  try {
    if (body.reset) await resetNovel(id, user.id)
    return NextResponse.json(await writeNextChapter(id, user.id))
  } catch (e) {
    if (e instanceof UsageExceededError) return NextResponse.json({ error: 'usage', limit: 'user' }, { status: 402 })
    if (e instanceof NovelError) return NextResponse.json({ error: e.reason }, { status: e.reason === 'not_found' ? 404 : 409 })
    observe('novel.chapter_failed', { sessionId: id, error: (e as Error).message })
    return NextResponse.json({ error: 'generation' }, { status: 502 })
  }
}
