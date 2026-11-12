import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { creatorOf, validCreatorKey } from '@/lib/creators'
import { creatorCards } from '@/lib/home'
import { Back, Page } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'
import { CreatorRow } from '@/components/creator-row'
import { getT } from '@/lib/i18n/server'
import cards from '../../home/home.module.css'

/** 11/12 크리에이터 페이지 — 작품 상세의 만든 사람 이름을 누르면 온다. 그 사람(운영 작품은 그 필명)의 공개 작품을 홈과 같은 카드로. */
export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const raw = (await params).id
  const id = (() => { try { return decodeURIComponent(raw) } catch { return raw } })()  // 회원 id 또는 필명 키('pen:이름')
  if (!validCreatorKey(id)) notFound()
  const user = await currentUser()
  const [creator, works, t] = await Promise.all([creatorOf(id, user?.id ?? null), creatorCards(id, user?.id ?? null), getT()])
  if (!creator) notFound()
  return (
    <Page wide>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px var(--gutter) 0' }}><Back href="/home" /></header>
      <section style={{ padding: '8px var(--gutter) 20px' }}>
        <h1 className="sr-only">{creator.name}</h1>
        <CreatorRow creator={creator} signedIn={!!user} />
        <p className="t-caption" style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)' }}>{t('작품 {n}개', { n: works.length })}</p>
      </section>
      {works.length
        ? <div className={cards.grid}>{works.map(c => <CharacterCard key={c.id} c={c} />)}</div>
        : <p className="t-caption" style={{ padding: '0 var(--gutter)', color: 'var(--color-text-tertiary)' }}>{t('아직 공개한 작품이 없어요.')}</p>}
    </Page>
  )
}
