'use client'
import { useState } from 'react'
import { CharacterCard } from '@/components/character-card'
import { Button } from '@/components/ui'
import type { CardPage } from '@/lib/home'
import { useT } from '@/lib/i18n/client'

export function MiroGrid({ initial }: { initial: CardPage }) {
  const t = useT()
  const [items, setItems] = useState(initial.items)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function loadMore() {
    if (!cursor || loading) return
    setLoading(true); setError(false)
    try {
      const response = await fetch(`/api/miro/cards?cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const page: CardPage = await response.json()
      setItems(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()])
      setCursor(page.nextCursor)
    } catch { setError(true) } finally { setLoading(false) }
  }

  if (items.length === 0 && !error) return <p data-miro-empty className="empty-state empty-state--fill">{t('아직 미로에 있는 캐릭터가 없어요')}</p>
  return <>
    {/* 태그는 카드 밑(2026-09-30 요청) — 줄 사이는 홈처럼 16px, 칸 사이는 4px. */}
    <div data-miro-grid className="grid-2" style={{ gap: '16px 4px', padding: '0 var(--gutter)' }}>
      {items.map(item => <CharacterCard key={item.id} c={item} tagsBelow />)}
    </div>
    {error && <p role="alert">{t('목록을 불러오지 못했어요.')} <Button type="button" size="sm" variant="ghost" onClick={loadMore}>{t('다시 시도')}</Button></p>}
    {cursor && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={loadMore} disabled={loading}>{loading ? t('불러오는 중') : t('더 보기')}</Button></div>}
  </>
}
