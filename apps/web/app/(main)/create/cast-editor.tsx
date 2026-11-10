'use client'
import { useId, useState } from 'react'
import { shrinkImage } from '@/lib/shrink-image'
import { uploadSituationImage } from './actions'
import { useT } from '@/lib/i18n/client'
import { VoiceList, type VoiceOption } from './voice-list'

/**
 * 다인 작품(11/10 사용자) — 등장인물 이름과 인물마다 고정 목소리. 저장은 characters.ensemble_voices { 이름: 목소리 id, '' = 자동 }.
 * 대사 화자가 이 이름(또는 이름+호칭)이면 그 목소리로 읽는다(lib/voice-text matchSpeaker). 채팅방에서 사용자가 바꾸면 그 방만 바뀐다.
 */
export type CastMember = { name: string; voice: string; photo?: string }
export const MAX_CAST = 20

export function CastNames({ cast, onChange }: { cast: CastMember[]; onChange: (c: CastMember[]) => void }) {
  const t = useT()
  const set = (i: number, name: string) => onChange(cast.map((c, j) => j === i ? { ...c, name } : c))
  // 11/10 인물 사진 — 고르자마자 올리고 URL 만 담는다(상황별 사진과 같은 업로드). 대화방 말풍선 아바타가 된다.
  const uid = useId()
  const [busy, setBusy] = useState<number | null>(null)
  const pick = async (i: number, file: File | undefined) => {
    if (!file) return
    setBusy(i)
    try {
      const fd = new FormData(); fd.set('file', await shrinkImage(file))
      const r = await uploadSituationImage(fd)
      if ('url' in r) onChange(cast.map((c, j) => j === i ? { ...c, photo: r.url } : c))
    } finally { setBusy(null) }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      {cast.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          <label htmlFor={`${uid}-${i}`} aria-label={t('인물 사진')} title={t('인물 사진')}
            style={{ width: 44, height: 44, flex: 'none', borderRadius: 22, overflow: 'hidden', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 12,
              background: 'var(--color-surface-2)', border: c.photo ? 0 : '1.5px dashed var(--color-border-strong)', color: 'var(--color-text-tertiary)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.photo ? <img src={c.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : busy === i ? '…' : '+'}
          </label>
          <input id={`${uid}-${i}`} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(i, f) }} />
          <input value={c.name} maxLength={20} onChange={e => set(i, e.target.value)} placeholder={t('인물 이름')} aria-label={t('인물 이름')}
            style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', font: 'inherit' }} />
          <button type="button" onClick={() => onChange(cast.filter((_, j) => j !== i))} aria-label={t('삭제')}
            style={{ minWidth: 44, borderRadius: 12, border: 0, background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      {cast.length < MAX_CAST && <button type="button" onClick={() => onChange([...cast, { name: '', voice: '' }])}
        style={{ minHeight: 44, borderRadius: 12, border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit' }}>+ {t('인물 추가')}</button>}
    </div>
  )
}

/** 목소리 탭 — 인물 줄을 누르면 그 인물의 목소리 목록이 펼쳐진다(채팅방 목소리 고르기와 같은 모양). */
export function CastVoices({ cast, voices, onChange }: { cast: CastMember[]; voices: VoiceOption[]; onChange: (c: CastMember[]) => void }) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  const named = cast.map((c, i) => ({ ...c, i })).filter(c => c.name.trim())
  if (!named.length) return <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>{t('프로필 탭에서 등장인물을 먼저 추가해 주세요.')}</p>
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {named.map(c => {
        const expanded = open === c.i
        const label = c.voice ? voices.find(v => v.id === c.voice)?.label.split(' · ')[0] ?? t('자동') : t('자동')
        return <div key={c.i} style={{ borderRadius: 12, background: 'var(--color-surface-2)' }}>
          <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.i)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 46, padding: '0 14px', border: 0, background: 'transparent', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{label}</span>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none', transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}><path d="M9 6l6 6-6 6"/></svg>
          </button>
          {expanded && <div style={{ margin: '0 8px 8px', padding: 8, borderRadius: 10, background: 'var(--color-bg)' }}>
            {/* 숨은 voiceId 칸이 겹치지 않게 name 을 바꿔 둔다 — 실제 값은 ensembleVoices JSON 으로 실린다 */}
            <VoiceList compact hiddenName={`castVoice${c.i}`} voices={voices} value={c.voice} autoLabel={t('자동')}
              onChange={v => onChange(cast.map((x, j) => j === c.i ? { ...x, voice: v } : x))} />
          </div>}
        </div>
      })}
    </div>
  )
}

/** 폼에 실을 값 — 이름 있는 인물만, 이름 중복은 처음 것. */
/** 인물 사진 { 이름: URL } — 사진이 있는 인물만. */
export function castPhotosJson(cast: CastMember[]): string {
  const out: Record<string, string> = {}
  for (const c of cast) { const n = c.name.trim(); if (n && c.photo && !(n in out)) out[n] = c.photo }
  return JSON.stringify(out)
}

export function castJson(cast: CastMember[]): string {
  const out: Record<string, string> = {}
  for (const c of cast) { const n = c.name.trim(); if (n && !(n in out)) out[n] = c.voice }
  return JSON.stringify(out)
}
