import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth'
import { definitionOf, runFor } from '@/lib/stories/repo'
import { messagesOf } from '@/lib/stories/turn'
import { runView } from '@/lib/stories/view'
import type { StoryState } from '@miro/domain'

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = new URL(req.url).searchParams
  const runId = z.string().uuid().safeParse(params.get('runId'))
  if (!runId.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const run = await runFor(user.id, runId.data)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const thread = params.get('thread')
  const def = await definitionOf(run.storyId)
  if (thread && !def.characters.some(c => c.key === thread)) return NextResponse.json({ error: 'thread' }, { status: 400 })
  const messages = await messagesOf(run.id)
  return NextResponse.json({ messages: thread ? messages.filter(m => m.channel === 'dm' && m.thread === thread) : messages,
    view: runView(def, run.state as StoryState), archived: run.status === 'archived' }, { headers: { 'cache-control': 'no-store' } })
}
