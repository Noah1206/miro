'use client'
import { useState } from 'react'
import { discoveryTagLabel, type DiscoveryGroup } from '@/lib/discovery-filters'
import { useT } from '@/lib/i18n/client'
import styles from './discovery-filters.module.css'

export function DiscoveryFilters({ groups, selected, onChange, counts, defaultExpanded = false, appearance = 'table' }: { groups: DiscoveryGroup[]; selected: string[]; onChange: (tags: string[]) => void; counts?: Record<string, number>; defaultExpanded?: boolean; appearance?: 'table' | 'search' }) {
  const t = useT()
  const [expanded, setExpanded] = useState<string[]>(() => defaultExpanded ? groups.map(group => group.id) : [])
  return <div className={styles.groups} data-appearance={appearance}>
    {groups.filter(group => group.tags.length).map(group => {
      const isCollapsed = !expanded.includes(group.id)
      const visibleTags = isCollapsed ? [...group.tags.filter(tag => selected.includes(tag)), ...group.tags.filter(tag => !selected.includes(tag))] : group.tags
      return <section key={group.id} className={styles.group} aria-labelledby={`discovery-${group.id}`}>
        <h3 id={`discovery-${group.id}`} className={styles.heading}>{t(group.title)}</h3>
        <div className={styles.options} data-collapsed={isCollapsed}>
          <div id={`discovery-tags-${group.id}`} className={`${styles.tags} ${isCollapsed ? styles.singleRow : ''}`}>
            {visibleTags.map(tag => <button type="button" key={tag} aria-pressed={selected.includes(tag)} disabled={!selected.includes(tag) && selected.length >= 32}
              aria-label={t(discoveryTagLabel(tag))} data-empty={counts?.[tag] === 0 || undefined}
              title={[group.popularTags?.includes(tag) ? t('대화량 기준 인기') : '', counts?.[tag] !== undefined ? t('결과 {count}개', { count: counts[tag] }) : ''].filter(Boolean).join(' · ') || undefined}
              onClick={() => onChange(selected.includes(tag) ? selected.filter(value => value !== tag) : [...selected, tag])}>
              <span className={styles.tagLabel}>{t(discoveryTagLabel(tag))}</span>
              {group.popularTags?.includes(tag) && <span aria-hidden="true" className={styles.popularBadge}>🔥</span>}
            </button>)}
          </div>
          {group.tags.length > 1 && <button type="button" className={styles.disclosure} aria-expanded={!isCollapsed} aria-controls={`discovery-tags-${group.id}`}
            aria-label={t(isCollapsed ? '{name} 더 보기' : '{name} 접기', { name: t(group.title) })}
            onClick={() => setExpanded(previous => isCollapsed ? [...previous, group.id] : previous.filter(id => id !== group.id))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={isCollapsed ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} /></svg>
            {t(isCollapsed ? '더 보기' : '접기')}
          </button>}
        </div>
      </section>
    })}
  </div>
}
