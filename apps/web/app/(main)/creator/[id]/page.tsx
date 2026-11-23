import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { creatorOf, validCreatorKey } from '@/lib/creators'
import { creatorCards } from '@/lib/home'
import { Back, Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { CreatorProfile } from './profile'
import styles from './creator.module.css'

/**
 * 11/12 크리에이터 페이지 — 작품 상세의 만든 사람 이름을 누르면 온다. 그 사람(운영 작품은 그 필명)의 공개 작품.
 * 11/20 사용자(스크린샷 두 장): 크리에이터 프로필 모양 — 사진·이름·배지, 팔로워·팔로잉, 소개, 팔로우·응원, 제작 캐릭터(수·대화량·정렬).
 */
export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const raw = (await params).id
  const id = (() => { try { return decodeURIComponent(raw) } catch { return raw } })()  // 회원 id 또는 필명 키('pen:이름')
  if (!validCreatorKey(id)) notFound()
  const user = await currentUser()
  const [creator, works, t] = await Promise.all([creatorOf(id, user?.id ?? null), creatorCards(id, user?.id ?? null), getT()])
  if (!creator) notFound()
  // 응원은 작품 단위로 보낸다(창작 보상) — 운영 필명·본인 페이지는 없음, 회원이면 대화가 가장 많은 공개 작품으로.
  const cheerId = creator.pen || creator.self || !user ? null : [...works].filter(c => !c.isOfficial).sort((a, b) => (b.chats ?? 0) - (a.chats ?? 0))[0]?.id ?? null
  return (
    <Page wide className={styles.page}>
      <header className={styles.top}><Back href="/home" /><h2>{t('크리에이터 프로필')}</h2><span /></header>
      <CreatorProfile creator={creator} works={works} signedIn={!!user} cheerId={cheerId} />
    </Page>
  )
}
