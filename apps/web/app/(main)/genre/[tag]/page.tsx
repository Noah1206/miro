import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GENRES, genreCards } from '@/lib/genre-pages'
import { Back, Page, TransitionLink } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'
import styles from '../../home/home.module.css'

/** 11/13 검색 노출: 장르별 목록('로맨스 AI 캐릭터챗' 같은 검색어용). 한 장르 = 한 주소, 장르마다 다른 제목·설명·목록. */

const genreOf = async (params: Promise<{ tag: string }>) => {
  const g = decodeURIComponent((await params).tag)
  return GENRES.includes(g) ? g : null
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const g = await genreOf(params)
  if (!g) return {}
  const title = `${g} AI 캐릭터챗 | 미로 AI 캐릭터챗`
  const description = `미로 AI 캐릭터챗에서 ${g} 장르 캐릭터와 1:1로 대화해 보세요. 성격과 세계관을 가진 ${g} 캐릭터가 먼저 말을 걸어요.`
  return { title: { absolute: title }, description, alternates: { canonical: `/genre/${encodeURIComponent(g)}` }, openGraph: { title, description, siteName: '미로 AI 캐릭터챗', locale: 'ko_KR' } }
}

export default async function Genre({ params }: { params: Promise<{ tag: string }> }) {
  const g = await genreOf(params)
  if (!g) notFound()
  const cards = await genreCards(g)
  if (!cards.length) notFound()   // 빈 목록 페이지는 검색엔진에 내지 않는다
  return (
    <Page wide>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-2) var(--gutter)' }}><Back href="/home" /></header>
      <section style={{ padding: '0 var(--gutter)', marginBottom: 'var(--space-5)' }}>
        <h1 className="t-title-2" style={{ margin: '0 0 8px' }}>{g} AI 캐릭터챗</h1>
        <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          미로 AI 캐릭터챗의 {g} 캐릭터 {cards.length}명이에요. 마음에 드는 캐릭터를 골라 1:1로 대화를 시작해 보세요.
        </p>
      </section>
      <div className={styles.grid}>{cards.map(c => <CharacterCard key={c.id} c={c} />)}</div>
      <nav aria-label="다른 장르" style={{ padding: 'var(--space-6) var(--gutter)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {GENRES.filter(x => x !== g).map(x => <TransitionLink key={x} href={`/genre/${encodeURIComponent(x)}`} className="t-caption" style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }}>{x} 캐릭터챗</TransitionLink>)}
      </nav>
    </Page>
  )
}
