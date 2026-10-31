'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'

export type VoiceOption = { id: string; label: string; mine?: boolean }
type Filter = 'all' | 'female' | 'male' | 'mine'

/**
 * 목소리 고르기(10/31, 플링 크리에이터 순위 목록 모양) — 위에 알약 거르기, 아래에 동그란 얼굴 + 이름·설명 줄 목록.
 * 고른 줄은 오른쪽에 '선택됨' 알약. 실제 값은 숨은 voiceId 칸으로 폼에 실린다.
 * ponytail: 여성·남성 거르기는 공식 목소리 이름('성우 여', '여성 …')으로 나눈다 — 목소리에 성별 칸이 생기면 그걸로.
 */
export function VoiceList({ voices, value, onChange }: { voices: VoiceOption[]; value: string; onChange: (id: string) => void }) {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const gender = (l: string) => /여성|성우 여/.test(l) ? 'female' : /남성|성우 남/.test(l) ? 'male' : null
  const shown = voices.filter((v) => filter === 'all' || (filter === 'mine' ? v.mine : gender(v.label) === filter))
  const pills: Array<[Filter, string]> = [['all', t('전체')], ['female', t('여성')], ['male', t('남성')], ...(voices.some((v) => v.mine) ? [['mine', t('내 음성')] as [Filter, string]] : [])]
  const rows = [...(filter === 'all' ? [{ id: '', label: t('기본') }] : []), ...shown]
  return (
    <div className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="voiceId" value={value} />
      <div role="group" aria-label={t('목소리 거르기')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pills.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            style={{ minHeight: 36, padding: '0 16px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: filter === k ? 'var(--color-text-primary)' : 'var(--color-surface-2)', color: filter === k ? 'var(--color-bg)' : 'var(--color-text-secondary)' }}>
            {label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label={t('목소리')} className="stack" style={{ gap: 4 }}>
        {rows.map((v) => {
          const [title, sub] = v.label.split(' · ')
          const on = value === v.id
          return (
            <button key={v.id || 'default'} type="button" role="radio" aria-checked={on} onClick={() => onChange(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '10px 8px', borderRadius: 14, border: 0, cursor: 'pointer', textAlign: 'left',
                background: on ? 'var(--color-surface-2)' : 'transparent', color: 'var(--color-text-primary)' }}>
              <span aria-hidden style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700,
                background: avatar(v.id), color: 'var(--color-white)' }}>{(title ?? '').replace(/^(성우|템플릿)\s*/, '').trim().slice(0, 1) || '♪'}</span>
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                {(sub || v.mine) && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{[sub, v.mine ? t('내 음성') : null].filter(Boolean).join(' · ')}</span>}
              </span>
              {on && <span style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: 'var(--color-accent)', color: 'var(--color-accent-on)' }}>{t('선택됨')}</span>}
            </button>
          )
        })}
        {rows.length === 0 && <p className="t-caption" style={{ margin: '8px 0', color: 'var(--color-text-tertiary)' }}>{t('해당하는 목소리가 없어요.')}</p>}
      </div>
    </div>
  )
}

/** 목소리마다 고정된 색 동그라미 — 사진이 없는 목소리를 한눈에 구분하게. */
function avatar(id: string) {
  let h = 0
  for (const c of id || 'default') h = (h * 31 + c.charCodeAt(0)) % 360
  return id ? `linear-gradient(135deg, hsl(${h} 45% 42%), hsl(${(h + 40) % 360} 50% 28%))` : 'var(--color-surface-3)'
}
