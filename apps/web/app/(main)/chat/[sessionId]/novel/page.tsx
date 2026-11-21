import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { loadNovel, novelTurns } from '@/lib/novel'
import { Page, PageHeader } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { NovelReader } from './reader'

/** 11/9 웹소설 — 11/21부터 유저가 화를 만들고 이름을 정하고 대화를 골라 넣는다(본문 = 대화 원문), 읽고 TXT 로 받는다. */
export default async function NovelPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const t = await getT()
  const [novel, turns] = await Promise.all([loadNovel(sessionId, user.id), novelTurns(sessionId, user.id)])
  if (!novel || !turns) notFound()
  return (
    <Page style={{ maxWidth: 640 }}>
      <PageHeader back={`/chat/${sessionId}`} eyebrow={novel.endingTitle ? `ENDING · ${novel.endingTitle}` : undefined} title={novel.title}
        lead={t('화를 만들고 이름을 정한 뒤, 넣을 대화를 골라 나만의 웹소설로 엮어요.')} />
      <NovelReader sessionId={sessionId} initial={novel} turns={turns} />
    </Page>
  )
}
