'use client'
import { CharacterCard } from '@/components/character-card'
import type { CardPage } from '@/lib/home'
import { useT } from '@/lib/i18n/client'

export function MiroGrid({ initial }: { initial: CardPage }) {
  const t = useT()
  if (initial.items.length === 0) return <p data-miro-empty className="empty-state empty-state--fill">{t('아직 미로에 있는 캐릭터가 없어요')}</p>
  return <div data-miro-grid className="grid-2" style={{ gap: '16px 4px', padding: '0 var(--gutter)' }}>
    {initial.items.map(item => <CharacterCard key={item.id} c={item} tagsBelow />)}
  </div>
}
