import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, roleplaySessions } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { UserNote } from '../memory-graph'
import { NotesHeader } from '../memory/notes-header'
import styles from '../memory/memory.module.css'

/** 11/17 유저노트 — 베이비챗과 같은 개념: 사용자가 이 이야기에서 꼭 지켜 달라고 적는 설정. 매 턴 사용자 입력 바로 앞에 실린다. 기억 노트(캐릭터의 기억)와 따로. */
export default async function UserNotePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const t = await getT()
  const [room] = await db.select({ name: characters.name, images: characters.images, note: roleplaySessions.userNote })
    .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))).limit(1)
  if (!room) notFound()
  return (
    <Page style={{ maxWidth: 640 }}>
      <NotesHeader sessionId={sessionId} name={room.name} photo={room.images?.[0]} active="note" />
      <section className={`${styles.section} ${styles.thought}`}>
        <p className="t-body">{t('이 대화에서 캐릭터가 꼭 지켜 줬으면 하는 설정을 적어 주세요. 매 답변 바로 앞에 실려서, 대화가 길어져도 잊지 않아요.')}</p>
        <ul className={styles.list}>
          <li>{t('예: 나는 서른 살 디자이너고, 반말로 불러 줘')}</li>
          <li>{t('예: 우리는 3년째 사귀는 사이야')}</li>
          <li>{t('예: 지금 이야기는 비 오는 겨울밤이 배경이야')}</li>
        </ul>
      </section>
      <section className={styles.section}>
        <UserNote sessionId={sessionId} initial={room.note} />
      </section>
    </Page>
  )
}
