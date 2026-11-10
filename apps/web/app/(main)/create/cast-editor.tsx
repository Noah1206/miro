'use client'
import { useId, useState, type ReactNode } from 'react'
import { shrinkImage } from '@/lib/shrink-image'
import { uploadSituationImage } from './actions'
import { useT } from '@/lib/i18n/client'
import { VoiceList, type VoiceOption } from './voice-list'
import type { CastProfile } from '@miro/domain'
import { ChoiceChips, LabeledField, box, fieldFont, fieldPad } from './form-parts'

/**
 * 다인 작품(11/10 사용자) — 등장인물 이름과 인물마다 고정 목소리. 저장은 characters.ensemble_voices { 이름: 목소리 id, '' = 자동 }.
 * 대사 화자가 이 이름(또는 이름+호칭)이면 그 목소리로 읽는다(lib/voice-text matchSpeaker). 채팅방에서 사용자가 바꾸면 그 방만 바뀐다.
 */
export type CastMember = { name: string; voice: string; photo?: string } & Partial<Omit<CastProfile, 'name'>>
export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const
export const MAX_CAST = 20

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

/** 11/11 저장할 인물 설정 — 이름 있는 인물만, 이름 중복은 처음 것. 성향은 안 고르면 가운데(50). */
export function castProfilesJson(cast: CastMember[]): string {
  const seen = new Set<string>()
  return JSON.stringify(cast.flatMap(c => {
    const name = c.name.trim()
    if (!name || seen.has(name)) return []
    seen.add(name)
    return [{ name, intro: (c.intro ?? '').trim(), age: c.age ?? '', mbti: c.mbti ?? '', nationality: c.nationality ?? '', occupation: c.occupation ?? '',
      jealousy: c.jealousy ?? 50, initiative: c.initiative ?? 50, emotionalExpression: c.emotionalExpression ?? 50 }]
  }))
}

const TRAITS = [
  { key: 'jealousy', label: '질투', choices: ['적음', '보통', '많음'] },
  { key: 'initiative', label: '다가가는 방식', choices: ['기다림', '상황에 따라', '먼저'] },
  { key: 'emotionalExpression', label: '감정 표현', choices: ['절제함', '적당히', '솔직함'] },
] as const
const level = (v = 50) => v < 34 ? 0 : v > 66 ? 2 : 1

function Field({ value, onChange, max, label, big }: { value: string; onChange: (v: string) => void; max: number; label: string; big?: boolean }) {
  const [focused, setFocused] = useState(false)
  return <div style={{ padding: fieldPad, ...box(focused) }}>
    <input aria-label={label} value={value} maxLength={max} autoComplete="off" onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: '100%', background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: big ? 'var(--font-body-size)' : fieldFont }} />
  </div>
}

function Area({ value, onChange, max, label }: { value: string; onChange: (v: string) => void; max: number; label: string }) {
  const [focused, setFocused] = useState(false)
  return <div style={{ padding: fieldPad, ...box(focused) }}>
    <textarea aria-label={label} value={value} maxLength={max} rows={6} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont, lineHeight: 1.5, fontFamily: 'inherit' }} />
    {value.length >= max * 0.8 && <div className="t-micro" style={{ textAlign: 'right', textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{value.length}/{max}</div>}
  </div>
}

/**
 * 11/11 다인 작품 — 주인공(위 '캐릭터' 칸) 아래로 같은 모양의 캐릭터 칸을 하나씩 더한다: 사진·이름·소개·반응 성향·고급 설정.
 * 사진은 고르자마자 올리고(상황별 사진과 같은 업로드) URL 만 담는다. 저장은 ensemble_cast·ensemble_voices·ensemble_photos.
 */
export function CastProfiles({ cast, onChange, heading }: { cast: CastMember[]; onChange: (c: CastMember[]) => void; heading: (index: number, body: ReactNode) => ReactNode }) {
  const t = useT()
  const uid = useId()
  const [busy, setBusy] = useState<number | null>(null)
  const [open, setOpen] = useState<Record<number, 'traits' | 'advanced' | 'both' | undefined>>({})
  const set = (i: number, patch: Partial<CastMember>) => onChange(cast.map((c, j) => j === i ? { ...c, ...patch } : c))
  const toggle = (i: number, what: 'traits' | 'advanced') => setOpen(o => {
    const cur = o[i], has = (k: string) => cur === k || cur === 'both'
    const next = has(what) ? (cur === 'both' ? (what === 'traits' ? 'advanced' : 'traits') : undefined) : (cur ? 'both' : what)
    return { ...o, [i]: next }
  })
  const pick = async (i: number, file: File | undefined) => {
    if (!file) return
    setBusy(i)
    try {
      const fd = new FormData(); fd.set('file', await shrinkImage(file))
      const r = await uploadSituationImage(fd)
      if ('url' in r) set(i, { photo: r.url })
    } finally { setBusy(null) }
  }
  return <>
    {cast.map((c, i) => {
      const o = open[i], traitsOpen = o === 'traits' || o === 'both', advancedOpen = o === 'advanced' || o === 'both'
      const summary = TRAITS.every(tr => level(c[tr.key]) === 1) ? t('균형') : TRAITS.map(tr => t(tr.choices[level(c[tr.key])]!)).join(' · ')
      return <div key={i}>{heading(i, <div className="stack" style={{ gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label htmlFor={`${uid}-${i}`} aria-label={t('캐릭터 이미지')}
            style={{ width: 88, height: 88, flex: 'none', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 22,
              background: 'var(--color-surface-2)', border: c.photo ? 0 : '1.5px dashed var(--color-border-strong)', color: 'var(--color-text-tertiary)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.photo ? <img src={c.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : busy === i ? '…' : '+'}
          </label>
          <input id={`${uid}-${i}`} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(i, f) }} />
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>{t('PNG, JPG, WebP, HEIC 이미지 파일만 올릴 수 있어요')}<br />{t('1:1 비율을 권장하며, 한 장당 5MB 이하만 가능해요')}</p>
        </div>
        <LabeledField label={t('이름')} required><Field label={t('이름')} value={c.name} max={10} big onChange={v => set(i, { name: v })} /></LabeledField>
        <LabeledField label={t('캐릭터 소개')} required hint={t('이 인물의 성격·가치관·말투, 주인공·사용자와의 관계를 적어 주세요.')}>
          <Area label={t('캐릭터 소개')} value={c.intro ?? ''} max={1000} onChange={v => set(i, { intro: v })} />
        </LabeledField>
        <div className="stack" style={{ gap: 8 }}>
          <button type="button" aria-expanded={traitsOpen} onClick={() => toggle(i, 'traits')}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 0, border: 0, background: 'none', color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left' }}>
            <span className="t-body" style={{ flex: 1, fontWeight: 'var(--weight-semibold)' }}>{t('반응 성향')}</span>
            <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{summary}</span>
          </button>
          {traitsOpen && TRAITS.map(tr => <fieldset key={tr.key} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="t-body" style={{ marginBottom: 8, fontWeight: 'var(--weight-semibold)' }}>{t(tr.label)}</legend>
            <ChoiceChips columns={3} value={String(level(c[tr.key]))} options={tr.choices.map((ch, k) => ({ value: String(k), label: t(ch) }))}
              onChange={v => set(i, { [tr.key]: [20, 50, 80][Number(v)] })} />
          </fieldset>)}
        </div>
        <button type="button" aria-expanded={advancedOpen} onClick={() => toggle(i, 'advanced')}
          style={{ minHeight: 48, borderRadius: 'var(--radius-button)', border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 'var(--font-body-size)' }}>
          {t('고급 설정')} {advancedOpen ? '▴' : '▾'}
        </button>
        {advancedOpen && <div className="stack" style={{ gap: 18 }}>
          <LabeledField label={t('나이')}><Field label={t('나이')} value={c.age ?? ''} max={10} onChange={v => set(i, { age: v })} /></LabeledField>
          <LabeledField label="MBTI"><ChoiceChips columns={4} value={c.mbti ?? ''} onChange={v => set(i, { mbti: v })}
            options={[{ value: '', label: t('선택 안 함') }, ...MBTI_TYPES.map(m => ({ value: m, label: m }))]} /></LabeledField>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <LabeledField label={t('국적')}><Field label={t('국적')} value={c.nationality ?? ''} max={40} onChange={v => set(i, { nationality: v })} /></LabeledField>
            <LabeledField label={t('직업')}><Field label={t('직업')} value={c.occupation ?? ''} max={60} onChange={v => set(i, { occupation: v })} /></LabeledField>
          </div>
        </div>}
        <button type="button" onClick={() => onChange(cast.filter((_, j) => j !== i))}
          style={{ alignSelf: 'flex-end', padding: '6px 0', border: 0, background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>{t('이 캐릭터 삭제')}</button>
      </div>)}</div>
    })}
    {cast.length < MAX_CAST && <button type="button" onClick={() => onChange([...cast, { name: '', voice: '' }])}
      style={{ width: '100%', minHeight: 52, marginTop: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 'var(--font-body-size)', fontWeight: 600 }}>+ {t('캐릭터 추가')}</button>}
  </>
}
