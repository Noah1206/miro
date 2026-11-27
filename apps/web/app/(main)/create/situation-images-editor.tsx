'use client'
import { useId, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { shrinkImage } from '@/lib/shrink-image'
import { SITUATION_LIMITS, type SituationImage } from '@/lib/situation-images'
import { box, fieldFont } from './form-parts'
import { tagSituationImage, uploadSituationImage } from './actions'

const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 18, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'rgba(var(--color-bg-rgb),0.75)', color: 'var(--color-white)' }

type Row = { id: number; image: string; keywords: string; situation: string; adult?: true; uploading?: boolean; error?: string
  /** 11/23 사진 태그(쉼표로 이어 쓴 글)·옷차림 단계 — 올리면 자동으로 붙는다(tagSituationImage). tagging = 붙이는 중. */
  tags: string; outfit?: 'dressed' | 'bare'; tagging?: boolean }

/**
 * 상황별 사진(10/28, 위프·베이비챗식) — 사진 한 장 + 상황 설명(+ 선택 키워드). 대화가 그 상황이 되면 AI 가 골라 채팅에 한 번 띄운다(10/31).
 * 사진은 고르자마자 올리고(uploadSituationImage) 폼에는 URL 만 JSON 으로 싣는다.
 */
export function SituationImagesEditor({ defaultValue }: { defaultValue: SituationImage[] }) {
  const t = useT()
  const uid = useId()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((e, id) => ({ id, image: e.image, keywords: e.keywords.join(', '), situation: e.situation ?? '', adult: e.adult, tags: (e.tags ?? []).join(', '), outfit: e.outfit })))
  const [nextId, setNextId] = useState(defaultValue.length)
  const idRef = useRef(defaultValue.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  // 앞 칸에 사진을 다 올려야 다음 칸을 연다(10/28) — 빈 칸만 쌓이지 않게.
  const canAdd = rows.every(r => r.image && !r.uploading)
  const value = rows.filter(r => r.image).map(r => ({ image: r.image, situation: r.situation.trim(), keywords: r.keywords.split(',').map(k => k.trim()).filter(Boolean), ...(r.adult ? { adult: true as const } : {}),
    tags: r.tags.split(',').map(k => k.trim()).filter(Boolean), ...(r.outfit ? { outfit: r.outfit } : {}) }))

  const pick = async (id: number, file: File | undefined, hint = '') => {
    if (!file) return
    patch(id, { uploading: true, error: undefined })
    const fd = new FormData()
    fd.set('file', await shrinkImage(file))
    try {
      const r = await uploadSituationImage(fd)
      patch(id, 'url' in r ? { image: r.url, uploading: false, tagging: true, tags: '', outfit: undefined } : { error: r.error, uploading: false })
      if (!('url' in r)) return
      // 11/23 사용자: 사진을 올리면 태그가 자동으로 — 비전 AI 가 사진을 보고 태그·옷차림을 붙이고, 상황 설명이 비어 있으면 한 줄을 채운다. 꺼져 있거나 실패하면 조용히 넘어간다.
      const tagged = await tagSituationImage(r.url, hint).catch(() => ({ off: true as const }))
      setRows(rs => rs.map(x => x.id !== id || x.image !== r.url ? x : 'off' in tagged ? { ...x, tagging: false }
        : { ...x, tagging: false, tags: tagged.tags.join(', '), outfit: tagged.outfit, situation: x.situation.trim() || tagged.situation, ...(tagged.adult ? { adult: true as const } : {}) }))
    } catch { patch(id, { error: '사진을 올리지 못했어요.', uploading: false, tagging: false }) }
  }

  // 11/18 여러 장 한 번에(바베챗처럼) — 고른 파일마다 칸을 바로 만들고 3장씩 올린다. 파일 이름을 상황 설명에 미리 넣는다(IMG_1234·해시 같은 이름은 빈칸).
  const [notice, setNotice] = useState('')
  const bulk = async (files: File[]) => {
    const take = files.slice(0, Math.max(0, SITUATION_LIMITS.entries - rows.length))
    // 11/18 한도를 넘친 사진은 말없이 버리지 않고 알린다.
    setNotice(files.length > take.length ? t('사진은 {max}장까지 넣을 수 있어요. {n}장은 올리지 않았어요.', { max: SITUATION_LIMITS.entries, n: files.length - take.length }) : '')
    if (!take.length) return
    const start = Math.max(idRef.current, nextId)
    idRef.current = start + take.length
    setNextId(start + take.length)
    const label = (f: File) => {
      const base = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      return /^(img|dsc|image|photo|screenshot|스크린샷|kakaotalk)\b|^[0-9a-f\s]{12,}$|^\d[\d\s]*$/i.test(base) ? '' : base.slice(0, SITUATION_LIMITS.situationLength)
    }
    setRows(rs => [...rs, ...take.map((f, i) => ({ id: start + i, image: '', keywords: '', situation: label(f), uploading: true, tags: '' }))])
    let next = 0
    const worker = async () => { while (next < take.length) { const i = next++; await pick(start + i, take[i], label(take[i]!)) } }
    await Promise.all([worker(), worker(), worker()])
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="situationImages" value={JSON.stringify(value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} className="stack" style={{ gap: 8 }}>
            {/* 사진 칸(label)과 버튼을 형제로 둔다 — label 안의 버튼은 파일 고르기를 열지 못한다. */}
            <div style={{ position: 'relative' }}>
              <label htmlFor={`${uid}-${r.id}`} style={{ position: 'relative', display: 'grid', placeItems: 'center', aspectRatio: '1 / 1', borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer',
                background: 'var(--color-surface-2)', border: r.image ? 0 : '1.5px dashed var(--color-border-strong)', color: 'var(--color-text-tertiary)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.image ? <img src={r.image} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span className="t-caption">{r.uploading ? t('올리는 중…') : t('사진 고르기')}</span>}
              </label>
              <input id={`${uid}-${r.id}`} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(r.id, f, r.situation) }} />
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                <label htmlFor={`${uid}-${r.id}`} role="button" tabIndex={0} aria-label={t('상황 사진 바꾸기')} style={iconBtn}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}>
                  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
                </label>
                <button type="button" aria-label={t('상황 사진 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))} style={iconBtn}>
                  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                </button>
              </div>
            </div>
            <textarea value={r.situation} onChange={e => patch(r.id, { situation: e.target.value })} aria-label={t('상황 설명')} maxLength={SITUATION_LIMITS.situationLength} rows={2} className="small-placeholder"
              placeholder={t('어떤 상황에 띄울까요? 예) 비 맞고 돌아와 젖은 셔츠 차림일 때')}
              style={{ ...box(false), padding: '10px 12px', fontSize: fieldFont, color: 'var(--color-text-primary)', outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
            <input value={r.keywords} onChange={e => patch(r.id, { keywords: e.target.value })} aria-label={t('상황 키워드')} maxLength={110} className="small-placeholder"
              placeholder={t('키워드 (선택, 쉼표로) 예) 비, 우산')}
              style={{ ...box(false), padding: '10px 12px', fontSize: fieldFont, color: 'var(--color-text-primary)', outline: 'none', width: '100%' }} />
            <input value={r.tagging ? '' : r.tags} onChange={e => patch(r.id, { tags: e.target.value })} aria-label={t('사진 태그')} maxLength={60} disabled={r.tagging} className="small-placeholder"
              placeholder={r.tagging ? t('태그 붙이는 중…') : t('태그 (사진을 올리면 자동으로 붙어요, 쉼표로 고칠 수 있어요)')}
              style={{ ...box(false), padding: '10px 12px', fontSize: fieldFont, color: 'var(--color-text-primary)', outline: 'none', width: '100%' }} />
            {/* 11/14 언베일 전용 체크 — 11/20 사용자: 화면에서 뺐다. 이미 표시된 사진은 값(adult)을 그대로 보낸다. */}
            {r.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(r.error)}</p>}
          </div>
        ))}
      </div>
      {rows.length < SITUATION_LIMITS.entries && (
        <button type="button" disabled={!canAdd} onClick={() => { const id = Math.max(idRef.current, nextId); idRef.current = id + 1; setRows(rs => [...rs, { id, image: '', keywords: '', tags: '', situation: '' }]); setNextId(id + 1) }}
          style={{ opacity: canAdd ? 1 : 0.45, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: 0, background: 'var(--color-white)', color: 'var(--color-lavender-700)', fontSize: 'var(--font-body-size)', cursor: canAdd ? 'pointer' : 'not-allowed' }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {t('상황 사진 추가 ({n}/{max})', { n: rows.length, max: SITUATION_LIMITS.entries })}
        </button>
      )}
      {rows.length < SITUATION_LIMITS.entries && <>
        <input id={`${uid}-bulk`} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; void bulk(fs) }} />
        <label htmlFor={`${uid}-bulk`} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', cursor: 'pointer' }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3M12 4v12M7 9l5-5 5 5" /></svg>
          {t('여러 장 한 번에 올리기')}
        </label>
      </>}
      {notice && <p role="status" className="t-caption" style={{ color: 'var(--color-danger)' }}>{notice}</p>}
    </div>
  )
}
