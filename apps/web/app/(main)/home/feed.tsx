'use client'
import { ContactBadge } from '@/components/contact-badge'
import { useState } from 'react'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { compact } from '@/lib/format'
import type { HomeCard, HomeRow } from '@/lib/home'
import styles from './home.module.css'

const unique = (items: HomeCard[]) => [...new Map(items.map(c => [c.id, c])).values()]
const picture = (c: HomeCard) => c.images[0] ?? null

function PhotoDetails({ c, small = false }: { c: HomeCard; small?: boolean }) {
  const tags = [...new Set([...(c.genre ?? '').split('·').map(t => t.trim()), ...c.relationshipKeywords])].filter(Boolean).slice(0, 2)
  return <>
    <span className={styles.cardBadges}>
    {c.plays > 0 && <span className={styles.plays} aria-label={`대화한 사람 ${c.plays}명`}>
      <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z" /></svg>
      {compact(c.plays)}
    </span>}
    </span>
    <ContactBadge enabled={c.contactEnabled} />
    <span className={`${styles.photoDetails} ${small ? styles.photoDetailsSmall : ''}`}>
      <strong>{c.name}</strong>
      {!small && (c.tagline || c.role) && <span className={styles.photoTagline}>{c.tagline || c.role}</span>}
      {tags.length > 0 && <span className={styles.photoTags}>{tags.map(t => `#${t.replace(/\s+/g, '')}`).join('  ')}</span>}
    </span>
  </>
}
function StoryCard({ c, resume = false }: { c: HomeCard; resume?: boolean }) {
  return <TransitionLink className={styles.story} href={`/character/${c.slug || c.id}`} aria-label={`${c.name}, ${c.role || '이야기 살펴보기'}`}>
    <div className={styles.poster}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug || c.id} photo={picture(c)} ratio="2 / 3" shared={false} scrim={false} style={{ borderRadius: 0 }} />
      <PhotoDetails c={c} />
    </div>
  </TransitionLink>
}

export function HomeFeed({ rows }: { rows: HomeRow[] }) {
  const [filter, setFilter] = useState<'all' | 'popular'>('all')
  const row = (key: string) => rows.find(r => r.key === key)?.items ?? []
  const continuing = row('continuing')
  const officials = unique(row('originals'))
  // Home recommendations require a cover and an introduction. Incomplete public creations remain in Discover.
  const community = row('shared').filter(c => picture(c) && (c.startingContext?.trim() || c.tagline?.trim()))
  const catalog = unique([...officials, ...community])
  const featured = officials.length > 2 ? officials.slice(-2) : []
  const featuredIds = new Set(featured.map(c => c.id))
  const recommendations = filter === 'popular'
    ? [...catalog].sort((a, b) => b.plays - a.plays).slice(0, 6)
    : catalog.filter(c => !featuredIds.has(c.id)).slice(0, 6)


  return <div className={styles.feed}>
    {continuing.length > 0 && <section className={styles.continuing} aria-labelledby="continue-title">
      <div className={styles.sectionHeading}><h2 id="continue-title">이어서 대화하기</h2><TransitionLink href="/archive">대화함 <span aria-hidden>↗</span></TransitionLink></div>
      <div className={styles.grid}>
        {continuing.slice(0, 6).map(c => <StoryCard key={c.sessionId} c={c} resume />)}
      </div>
    </section>}

    <h1 className="sr-only">홈</h1>
    <div className={styles.filters} role="group" aria-label="이야기 정렬">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체</button>
      <button type="button" aria-pressed={filter === 'popular'} onClick={() => setFilter('popular')}>인기</button>
    </div>

    <section aria-labelledby="recommend-title">
      <div className={styles.sectionHeading}><h2 id="recommend-title">{filter === 'popular' ? '인기 이야기' : '주간 트렌드'}</h2></div>
      <div className={styles.grid}>{recommendations.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {/* 빈 화면에서 멈추지 않게 한다 — 한 줄과 갈 곳만. 버튼이 할 일을 말하므로 설명은 얹지 않는다. */}
      {recommendations.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden>✳</span>
          <p className={styles.emptyTitle}>{filter === 'popular' ? '아직 인기 이야기가 없어요' : '아직 이야기가 없어요'}</p>
          <div className={styles.emptyActions}>
            <TransitionLink href="/create">캐릭터 만들기</TransitionLink>
            <TransitionLink href="/home/search">둘러보기</TransitionLink>
          </div>
        </div>
      )}
    </section>

    {filter === 'all' && featured.length > 0 && <section className={styles.originals} aria-labelledby="originals-title">
      <div className={styles.sectionHeading}><div><h2 id="originals-title">신작</h2></div><span className={styles.originalMark} aria-hidden>✳</span></div>
      <div className={styles.grid}>{featured.map(c => <StoryCard key={c.id} c={c} />)}</div>
    </section>}

  </div>
}
