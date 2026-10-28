'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { shrinkImage } from '@/lib/shrink-image'
import { SITUATION_LIMITS, type SituationImage } from '@/lib/situation-images'
import { box, fieldFont } from './form-parts'
import { uploadSituationImage } from './actions'

type Row = { id: number; image: string; keywords: string; uploading?: boolean; error?: string }

/**
 * 상황별 사진(10/28, 위프·베이비챗식) — 사진 한 장 + 상황 키워드. 대화 중 키워드가 나오면 그 사진이 채팅에 한 번 뜬다.
 * 사진은 고르자마자 올리고(uploadSituationImage) 폼에는 URL 만 JSON 으로 싣는다.
 */
export function SituationImagesEditor({ defaultValue }: { defaultValue: SituationImage[] }) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((e, id) => ({ id, image: e.image, keywords: e.keywords.join(', ') })))
  const [nextId, setNextId] = useState(defaultValue.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const value = rows.filter(r => r.image).map(r => ({ image: r.image, keywords: r.keywords.split(',').map(k => k.trim()).filter(Boolean) }))

  const pick = async (id: number, file: File | undefined) => {
    if (!file) return
    patch(id, { uploading: true, error: undefined })
    const fd = new FormData()
    fd.set('file', await shrinkImage(file))
    try {
      const r = await uploadSituationImage(fd)
      patch(id, 'url' in r ? { image: r.url, uploading: false } : { error: r.error, uploading: false })
    } catch { patch(id, { error: '사진을 올리지 못했어요.', uploading: false }) }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="situationImages" value={JSON.stringify(value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} className="stack" style={{ gap: 8 }}>
            <label style={{ position: 'relative', display: 'grid', placeItems: 'center', aspectRatio: '1 / 1', borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer',
              background: 'var(--color-surface-2)', border: r.image ? 0 : '1.5px dashed var(--color-border-strong)', color: 'var(--color-text-tertiary)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.image ? <img src={r.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span className="t-caption">{r.uploading ? t('올리는 중…') : t('사진 고르기')}</span>}
              <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(r.id, f) }} />
              <button type="button" aria-label={t('상황 사진 빼기')} onClick={e => { e.preventDefault(); setRows(rs => rs.filter(x => x.id !== r.id)) }}
                style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'rgba(var(--color-bg-rgb),0.75)', color: 'var(--color-white)' }}>
                <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </label>
            <input value={r.keywords} onChange={e => patch(r.id, { keywords: e.target.value })} aria-label={t('상황 키워드')} maxLength={110}
              placeholder={t('상황 키워드 (쉼표로) 예) 비, 우산')}
              style={{ ...box(false), padding: '10px 12px', fontSize: fieldFont, color: 'var(--color-text-primary)', outline: 'none', width: '100%' }} />
            {r.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(r.error)}</p>}
          </div>
        ))}
      </div>
      {rows.length < SITUATION_LIMITS.entries && (
        <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, image: '', keywords: '' }]); setNextId(n => n + 1) }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', cursor: 'pointer' }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {t('상황 사진 추가 ({n}/{max})', { n: rows.length, max: SITUATION_LIMITS.entries })}
        </button>
      )}
    </div>
  )
}
