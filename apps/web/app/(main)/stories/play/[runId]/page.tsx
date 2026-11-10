import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, stories, userSettings } from '@miro/db'
import type { StoryPublic, StoryState } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { definitionOf, runFor } from '@/lib/stories/repo'
import { messagesOf } from '@/lib/stories/turn'
import { runView } from '@/lib/stories/view'
import { StoryPlay } from './play'

export const dynamic = 'force-dynamic'

export default async function PlayPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ tab?: string; thread?: string }> }) {
  const user = await currentUser()
  const { runId } = await params
  if (!user) redirect('/home')
  const run = await runFor(user.id, runId)
  if (!run) notFound()
  const [[story], def, messages, [settings]] = await Promise.all([db.select({ slug: stories.slug, public: stories.public }).from(stories).where(eq(stories.id, run.storyId)), definitionOf(run.storyId), messagesOf(run.id), db.select({ tz: userSettings.timeZone }).from(userSettings).where(eq(userSettings.userId, user.id))])
  const pub = story!.public as StoryPublic
  const { tab, thread } = await searchParams
  const selected = pub.characters.some(c => c.key === thread) ? thread! : messages.find(m => m.channel === 'dm' && !m.read)?.thread ?? 'scene'
  return (
    <StoryPlay runId={run.id} runNo={run.runNo} archived={run.status === 'archived'} slug={story!.slug} title={pub.title} entry={pub.entry} opening={[pub.entry?.prelude, pub.opening].filter(Boolean).join('\n\n')} medium={pub.medium}
      characters={pub.characters.map(c => ({ key: c.key, name: c.name, image: c.image ?? null }))} initialMessages={messages} initialView={runView(def, run.state as StoryState)}
      timeZone={settings?.tz ?? null} initialTab={tab === 'dm' ? selected : 'scene'} />
  )
}
