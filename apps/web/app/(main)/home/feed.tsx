'use client'
import { useState } from 'react'
import { Button, TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { compact } from '@/lib/format'
import type { CardPage, HomeCard } from '@/lib/home'
import styles from './home.module.css'
import { useLanguage, useT } from '@/lib/i18n/client'

const unique = (items: HomeCard[]) => [...new Map(items.map(c => [c.id, c])).values()]
const picture = (c: HomeCard) => c.images[0] ?? null

function PhotoDetails({ c }: { c: HomeCard }) {
  const t = useT()
  const language = useLanguage()
  const tags = [...new Set([...(c.genre ?? '').split('·').map(g => g.trim()), ...c.relationshipKeywords])].filter(Boolean).slice(0, 2)
  return <>
    <span className={styles.cardBadges}>
    {c.plays > 0 && <span className={styles.plays} aria-label={t('대화한 사람 {n}명', { n: c.plays })}>
      <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z" /></svg>
      {compact(c.plays, language)}
    </span>}
    </span>
    <span className={styles.photoDetails}>
      <strong>{c.name}</strong>
      {(c.tagline || c.role) && <span className={styles.photoTagline}>{c.tagline || c.role}</span>}
      {tags.length > 0 && <span className={styles.photoTags}>{tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join('  ')}</span>}
    </span>
  </>
}
function StoryCard({ c }: { c: HomeCard }) {
  const t = useT()
  return <TransitionLink className={styles.story} href={`/character/${c.slug || c.id}`} aria-label={`${c.name}, ${c.role || t('이야기 살펴보기')}`}>
    <div className={styles.poster}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug || c.id} photo={picture(c)} ratio="2 / 3" shared={false} scrim={false} style={{ borderRadius: 0 }} />
      <PhotoDetails c={c} />
    </div>
  </TransitionLink>
}

type Sort = 'all' | 'popular'
/** 목록 네 개 — 전체/인기 × R(미로 캐릭터만) 꺼짐/켜짐. 처음 볼 때 한 번 불러와 둔다. */
type Key = Sort | `r-${Sort}`

/**
 * 금빛 R 배지 — 황금 테두리 원 안에 금빛 R(2026-09-30 요청: 겉은 황금색, 원 안에 R). 스위치 앞 이름표.
 * 원 지름은 스위치 트랙 높이(26)와 같아 가운데가 맞는다. 글자는 페이지 글꼴의 가장 굵은 R 이고, 테두리를 먼저 그린 뒤(paint-order) 금빛 면을 얹는다.
 */
function RealityMark() {
  return <svg aria-hidden width="26" height="26" viewBox="0 0 26 26" className={styles.goldR}>
    <defs>
      <linearGradient id="goldRFace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFF8D6" /><stop offset=".32" stopColor="#FBDC72" /><stop offset=".55" stopColor="#E3AC2C" />
        <stop offset=".78" stopColor="#B67A12" /><stop offset="1" stopColor="#F3C95C" />
      </linearGradient>
      <linearGradient id="goldRRim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFEFB0" /><stop offset=".5" stopColor="#C9921C" /><stop offset="1" stopColor="#7A4E08" />
      </linearGradient>
      <radialGradient id="goldRCoin" cx=".5" cy=".3" r=".75">
        <stop offset="0" stopColor="#3B2A10" /><stop offset="1" stopColor="#140F08" />
      </radialGradient>
    </defs>
    <circle cx="13" cy="13" r="11.9" fill="url(#goldRCoin)" stroke="url(#goldRRim)" strokeWidth="2.2" />
    <text x="13" y="18.4" textAnchor="middle" fontSize="15" fontWeight="900" fill="url(#goldRFace)" stroke="#6B4306" strokeWidth=".9"
      strokeLinejoin="round" paintOrder="stroke" style={{ fontFamily: 'inherit' }}>R</text>
  </svg>
}

export function HomeFeed({ initial, initialReality = false }: { initial: CardPage; initialReality?: boolean }) {
  const [filter, setFilter] = useState<Sort>('all')
  /** R 토글(2026-09-30 요청) — 앱 밖 연락(문자·전화)이 실제로 켜진 미로 캐릭터만. 전체·인기와 함께 걸린다. */
  const [reality, setReality] = useState(initialReality)
  const [lists, setLists] = useState<Partial<Record<Key, CardPage>>>({ [initialReality ? 'r-all' : 'all']: initial })
  const [loading, setLoading] = useState<Key | null>(null)
  const [failed, setFailed] = useState<Key | null>(null)
  const t = useT()
  const key: Key = reality ? `r-${filter}` : filter
  const list = lists[key]
  const recommendations = list?.items ?? []
  const isLoading = loading === key
  const error = failed === key
  const empty = !!list && recommendations.length === 0 && !isLoading && !error
  /** 목록을 처음 불러오는 동안은 빈 목록으로 기다린다 — 글 대신 가운데에서 튕기는 점 세 개(2026-09-30 요청). */
  const waiting = isLoading && !list

  async function load(k: Key, more = false) {
    const current = lists[k]
    if (loading === k || (more ? !current?.nextCursor : current)) return
    setLoading(k); setFailed(null)
    const query = new URLSearchParams()
    if (k.endsWith('popular')) query.set('sort', 'popular')
    if (k.startsWith('r-')) query.set('reality', '1')
    if (more && current?.nextCursor) query.set('cursor', current.nextCursor)
    try {
      const response = await fetch(`/api/home/cards?${query}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const data: CardPage | HomeCard[] = await response.json()
      // 인기는 한 번에 오는 배열(더 보기 없음), 전체는 커서가 있는 쪽 단위.
      const page: CardPage = Array.isArray(data) ? { items: data, nextCursor: null } : data
      setLists(all => ({ ...all, [k]: { items: unique([...(more ? all[k]?.items ?? [] : []), ...page.items]), nextCursor: page.nextCursor } }))
    } catch { setFailed(k) } finally { setLoading(l => (l === k ? null : l)) }
  }

  function show(next: { filter?: Sort; reality?: boolean }) {
    const f = next.filter ?? filter
    const r = next.reality ?? reality
    setFilter(f); setReality(r)
    // 주소도 맞춘다 — 새로 고침하거나 공유해도 R 이 그대로. 화면을 다시 그리지 않는 replaceState.
    if (r !== reality) window.history.replaceState(window.history.state, '', r ? '/home?r=1' : '/home')
    void load(r ? `r-${f}` : f)
  }

  return <div className={`${styles.feed} ${empty || waiting ? styles.fill : ''}`}>
    <h1 className="sr-only">{t('홈')}</h1>
    <div id="stories" className={styles.filterRow}>
      <div className={styles.filters} role="group" aria-label={t('이야기 정렬')}>
        <button type="button" aria-pressed={filter === 'all'} onClick={() => show({ filter: 'all' })}>{t('전체')}</button>
        <button type="button" aria-pressed={filter === 'popular'} onClick={() => show({ filter: 'popular' })}>{t('인기')}</button>
      </div>
      {/* R 스위치 — 오른쪽 끝(2026-09-30 요청, 위프의 세이프 스위치처럼 이름표 + 스위치). 켜면 앱 밖 연락이 켜진 미로 캐릭터만. */}
      <button type="button" role="switch" aria-checked={reality} aria-label={t('미로 캐릭터만 보기')} title={t('미로 캐릭터만 보기')}
        className={styles.realitySwitch} onClick={() => show({ reality: !reality })}>
        <RealityMark />
        <span aria-hidden className={styles.switchTrack}><span className={styles.switchKnob} /></span>
      </button>
    </div>

    <section aria-labelledby="recommend-title" className={empty || waiting ? styles.fill : undefined}>
      <div className={styles.sectionHeading}><h2 id="recommend-title">{filter === 'popular' ? t('인기 이야기') : t('전체 이야기')}</h2></div>
      <div className={styles.grid}>{recommendations.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {waiting
        ? <div role="status" className={`empty-state empty-state--fill ${styles.loadingDots}`}><i aria-hidden /><i aria-hidden /><i aria-hidden /><span className="sr-only">{t('불러오는 중')}</span></div>
        : isLoading && <p role="status">{t('불러오는 중')}</p>}
      {error && <p role="alert">{t('목록을 불러오지 못했어요.')} <Button type="button" size="sm" variant="ghost" onClick={() => load(key, !!list)}>{t('다시 시도')}</Button></p>}
      {empty && <p className="empty-state empty-state--fill">{reality ? t('아직 미로에 있는 캐릭터가 없어요') : filter === 'popular' ? t('아직 인기 이야기가 없어요') : t('아직 이야기가 없어요')}</p>}
      {filter === 'all' && list?.nextCursor && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={() => load(key, true)} disabled={isLoading}>{isLoading ? t('불러오는 중') : t('더 보기')}</Button></div>}
    </section>

  </div>
}
