import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { loadNovel } from '@/lib/novel'
import { Page, PageHeader } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { NovelReader } from './reader'

/** 11/9 웹소설 — 대화방 전체를 화 단위 웹소설로 쓰고 읽고 TXT 로 받는다. */
export default async function NovelPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const t = await getT()
  const novel = await loadNovel(sessionId, user.id)
  if (!novel) notFound()
  return (
    <Page style={{ maxWidth: 640 }}>
      <PageHeader back={`/chat/${sessionId}`} eyebrow={novel.endingTitle ? `ENDING · ${novel.endingTitle}` : undefined} title={novel.title}
        lead={t('지금까지의 대화를 웹소설로 다시 써요. 한 화씩 써지니 잠시 기다려 주세요.')} />
      <NovelReader sessionId={sessionId} initial={novel} />
    </Page>
  )
}
