'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '@/lib/i18n/client'
import css from './voice-list.module.css'
import { LogoMark } from '@/components/ui'

export type VoiceOption = { id: string; label: string; mine?: boolean; image?: string | null }
type Filter = 'all' | 'female' | 'male' | 'mine'
const DEFAULT_VOICE_NAME = '지환'

/**
 * 목소리 고르기(10/31, 플링 순위 목록 모양을 사용자와 HTML 로 맞춤) — 위에 알약 거르기, 아래에 동그란 아이콘 + 성별(옅게)·이름 두 줄 목록.
 * 고른 줄만 밝은 카드가 되고, 오른쪽 끝에 흰 재생 버튼, 아래로 재생바가 미끄러져 나온다. 실제 값은 숨은 voiceId 칸으로 폼에 실린다.
 * ponytail: 여성·남성은 공식 목소리 이름('성우 여', '여성 …')으로 나눈다 — 목소리에 성별 칸이 생기면 그걸로.
 */
export function VoiceList({ voices, value, onChange }: { voices: VoiceOption[]; value: string; onChange: (id: string) => void }) {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const gender = (l: string) => /여성|성우 여/.test(l) ? 'female' : /남성|성우 남/.test(l) ? 'male' : null
  const shown = voices.filter((v) => filter === 'all' || (filter === 'mine' ? v.mine : gender(v.label) === filter))
  const pills: Array<[Filter, string]> = [['all', t('전체')], ['female', t('여성')], ['male', t('남성')], ...(voices.some((v) => v.mine) ? [['mine', t('내 음성')] as [Filter, string]] : [])]
  // 기본 목소리(음성 서버 DEFAULT_VOICE, 남성)는 사람 이름으로 보인다(10/31 사용자) — 이름이라 번역하지 않는다
  const rows: VoiceOption[] = [...(filter === 'all' || filter === 'male' ? [{ id: '', label: DEFAULT_VOICE_NAME }] : []), ...shown]
  return (
    <div className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="voiceId" value={value} />
      {voices.length > 0 && <div role="group" aria-label={t('목소리 거르기')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pills.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            style={{ minHeight: 36, padding: '0 16px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: filter === k ? 'var(--color-text-primary)' : 'var(--color-surface-2)', color: filter === k ? 'var(--color-bg)' : 'var(--color-text-secondary)' }}>
            {label}
          </button>
        ))}
      </div>}
      <div role="radiogroup" aria-label={t('목소리')} className="stack" style={{ gap: 4 }}>
        {rows.map((v) => {
          const [title, sub] = v.label.split(' · ')
          // 위 줄: 성별(+나이). 톤 설명은 뺀다. 기본 목소리는 음성 서버 기본값(asmr01, 남성)
          const g = v.id === '' ? 'male' : gender(v.label)
          const age = (sub ?? '').replace(/^(여성|남성)\s*/, '').replace(/\S*\s*톤$/, '').trim()
          const top = [g === 'female' ? t('여성') : g === 'male' ? t('남성') : null, age || null, v.mine ? t('내 음성') : null].filter(Boolean).join(' · ')
          const row = (playing: boolean) => (
            <button type="button" role="radio" aria-checked={value === v.id} onClick={() => onChange(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, padding: '12px 16px', border: 0, cursor: 'pointer', textAlign: 'left',
                background: 'transparent', color: 'var(--color-text-primary)', font: 'inherit' }}>
              <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700,
                background: v.image ? `center / cover url(${v.image})` : v.mine ? DEFAULT_VOICE_BG : avatar(v.id), color: 'var(--color-white)' }}>
                {v.image ? null : v.mine ? <VoiceLogo size={20} /> : (title ?? '').replace(/^(성우|템플릿)\s*/, '').trim().slice(0, 1) || '♪'}</span>
              <span className="stack" style={{ gap: 0, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                {top && <span style={{ fontSize: 12, color: '#7a7a7a' }}>{top}</span>}
                <span className={playing ? css.flow : undefined} style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
              </span>
            </button>
          )
          return value === v.id
            ? <Selected key={v.id || 'default'} id={v.id} row={row} />
            : <div key={v.id || 'default'} style={{ display: 'flex', borderRadius: 14 }}>{row(false)}</div>
        })}
        {rows.length === 0 && <p className="t-caption" style={{ margin: '8px 0', color: 'var(--color-text-tertiary)' }}>{t('해당하는 목소리가 없어요.')}</p>}
      </div>
    </div>
  )
}

/**
 * 고른 목소리 — 밝은 카드, 이름 줄 오른쪽 끝 흰 재생 버튼. 재생하는 동안 이름이 라벤더색으로 음악처럼 흐른다(10/31, 재생바 대신).
 * 처음 누를 때 견본을 받는다(공식 목소리는 처음 한 번 GPU 가 만든다).
 */
function Selected({ id, row }: { id: string; row: (playing: boolean) => ReactNode }) {
  const t = useT()
  const audio = useRef<HTMLAudioElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  // 누르는 순간 바로 바뀐다 — 오디오 이벤트를 기다리지 않는다. 견본을 받는 중에 다시 누르면 받기를 그만둔다.
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = useRef(0)
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  async function toggle() {
    const el = audio.current
    if (!el) return
    if (playing) { run.current++; el.pause(); setPlaying(false); return }
    setPlaying(true); setFailed(false)
    if (src) { el.currentTime = el.ended ? 0 : el.currentTime; void el.play(); return }
    const mine = ++run.current
    for (let i = 0; i < 180 && run.current === mine; i++) {
      const res = await fetch(`/api/voices/${id || 'default'}/sample`).catch(() => null)
      if (run.current !== mine) return
      if (res?.status === 202) { await new Promise((r) => setTimeout(r, 1000)); continue }
      if (!res?.ok) break
      const url = URL.createObjectURL(await res.blob())
      if (run.current !== mine) { URL.revokeObjectURL(url); return }
      setSrc(url); el.src = url; void el.play()
      return
    }
    if (run.current === mine) { setPlaying(false); setFailed(true) }
  }

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--color-surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingRight: 18 }}>
        {row(playing)}
        <button type="button" onClick={toggle} aria-label={playing ? t('멈추기') : t('미리 듣기')}
          style={{ width: 32, height: 32, borderRadius: '50%', border: 0, flexShrink: 0, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: '#fff', color: '#111' }}>
          {playing
            ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden><rect x="6.5" y="6" width="4" height="12" rx="2" /><rect x="13.5" y="6" width="4" height="12" rx="2" /></svg>
            // 둥글둥글한 ▶ — 같은 색 굵은 둥근 테두리로 모서리를 깎는다(살짝 오른쪽이 눈으로 보기에 가운데)
            : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden><path d="M9.5 7.5v9l7-4.5z" stroke="currentColor" strokeWidth="3.6" strokeLinejoin="round" /></svg>}
        </button>
      </div>
      {failed && <p className="t-caption" role="alert" style={{ margin: '0 16px 12px', color: 'var(--color-danger)' }}>{t('미리 듣기 실패. 다시 눌러 주세요.')}</p>}
      <audio ref={audio} preload="none" onEnded={() => setPlaying(false)} />
    </div>
  )
}

/** 사진을 안 넣은 회원 목소리의 기본 프로필 — 회색 동그라미에 회색 미로 로고(10/31 사용자). */
export const DEFAULT_VOICE_BG = 'var(--color-surface-3)'
export function VoiceLogo({ size }: { size: number }) {
  return <span style={{ filter: 'grayscale(1)', opacity: 0.45, display: 'grid' }}><LogoMark size={size} label="" /></span>
}

/** 목소리마다 고정된 색 동그라미 — 사진이 없는 목소리를 한눈에 구분하게. 내 음성 화면도 같은 색을 쓴다. */
export function avatar(id: string) {
  let h = 0
  for (const c of id || 'default') h = (h * 31 + c.charCodeAt(0)) % 360
  return id ? `linear-gradient(135deg, hsl(${h} 45% 42%), hsl(${(h + 40) % 360} 50% 28%))` : 'var(--color-surface-3)'
}
