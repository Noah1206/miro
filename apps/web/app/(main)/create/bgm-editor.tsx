'use client'
import { useId, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { BGM_LIMITS, type Bgm } from '@/lib/bgm'
import { box, fieldFont } from './form-parts'
import { uploadBgm } from './actions'

type Row = { id: number; url: string; name: string; situation: string; uploading?: boolean; error?: string }

/** 11/19 상황별 BGM — 음악 파일 하나 + 상황 설명. 고르자마자 올리고 폼에는 주소만 JSON 으로 싣는다(상황별 사진과 같은 방식). */
export function BgmEditor({ defaultValue }: { defaultValue: Bgm[] }) {
  const t = useT(), uid = useId()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((e, id) => ({ id, url: e.url, name: e.name ?? '', situation: e.situation })))
  const next = useRef(defaultValue.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const value = rows.filter(r => r.url).map(r => ({ url: r.url, situation: r.situation.trim(), ...(r.name ? { name: r.name } : {}) }))

  const add = async (files: File[]) => {
    for (const file of files.slice(0, BGM_LIMITS.entries - rows.length)) {
      const id = next.current++
      setRows(rs => [...rs, { id, url: '', name: file.name.replace(/\.[^.]+$/, '').slice(0, BGM_LIMITS.nameLength), situation: '', uploading: true }])
      const fd = new FormData(); fd.set('file', file)
      try { const r = await uploadBgm(fd); patch(id, 'url' in r ? { url: r.url, uploading: false } : { error: r.error, uploading: false }) }
      catch { patch(id, { error: '음악을 올리지 못했어요.', uploading: false }) }
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="bgm" value={JSON.stringify(value)} />
      {rows.map(r => (
        <div key={r.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong className="t-caption" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || t('음악')}</strong>
            <button type="button" className="t-caption" onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))} style={{ border: 0, background: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>{t('빼기')}</button>
          </div>
          {r.uploading ? <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('올리는 중…')}</p>
            : r.url ? <audio controls preload="none" src={r.url} style={{ width: '100%' }} /> : null}
          <textarea value={r.situation} onChange={e => patch(r.id, { situation: e.target.value })} aria-label={t('상황 설명')} maxLength={BGM_LIMITS.situationLength} rows={2} className="small-placeholder"
            placeholder={t('어떤 상황에 틀까요? 예) 쫓기거나 급박한 순간 · 비워 두면 기본 음악')}
            style={{ ...box(false), padding: '10px 12px', fontSize: fieldFont, color: 'var(--color-text-primary)', outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
          {r.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(r.error)}</p>}
        </div>
      ))}
      {rows.length < BGM_LIMITS.entries && <>
        <input id={`${uid}-bgm`} type="file" hidden multiple accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav"
          onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; void add(fs) }} />
        <label htmlFor={`${uid}-bgm`} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', cursor: 'pointer' }}>
          {t('BGM 추가 ({n}/{max})', { n: rows.length, max: BGM_LIMITS.entries })}
        </label>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('mp3·m4a·ogg·wav, 한 곡 8MB까지. 저작권이 있는 음악은 올리지 마세요.')}</p>
      </>}
    </div>
  )
}
