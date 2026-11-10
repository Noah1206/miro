import { ChatTheme } from '@/components/chat-theme'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, stories, userSettings } from '@miro/db'
import type { StoryPublic, StoryState } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { definitionOf, runFor } from '@/lib/stories/repo'
import { messagesOf } from '@/lib/stories/turn'
import { runView } from '@/lib/stories/view'
import { StoryPlay } from '../../../../stories/play/[runId]/play'

export const dynamic = 'force-dynamic'
export default async function StoryMessagePage({ params }: { params: Promise<{ runId: string; thread: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { runId, thread } = await params
  if (!/^[0-9a-f-]{36}$/i.test(runId)) notFound()
  const run = await runFor(user.id, runId)
  if (!run) notFound()
  const [[story], def, messages, [settings]] = await Promise.all([
    db.select({ slug: stories.slug, public: stories.public }).from(stories).where(eq(stories.id, run.storyId)),
    definitionOf(run.storyId), messagesOf(run.id),
    db.select({ tz: userSettings.timeZone }).from(userSettings).where(eq(userSettings.userId, user.id)),
  ])
  const pub = story!.public as StoryPublic
  if (!pub.characters.some(c => c.key === thread)) notFound()
  return <ChatTheme sessionId={`story:${run.id}:${thread}`}><StoryPlay runId={run.id} runNo={run.runNo} archived={run.status === 'archived'} slug={story!.slug} title={pub.title} opening={pub.opening} medium={pub.medium}
    characters={pub.characters.map(c => ({ key: c.key, name: c.name, image: c.image ?? null }))}
    initialMessages={messages.filter(m => m.channel === 'dm' && m.thread === thread)} initialView={runView(def, run.state as StoryState)}
    timeZone={settings?.tz ?? null} initialTab={thread} messenger /></ChatTheme>
}
