'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { CUSTOM_SCENE_LIMITS, type CustomPhotoScene } from '@/lib/photo-scenes'
import { box, fieldFont } from './form-parts'

type Row = CustomPhotoScene & { id: number }

/**
 * 사진 장면(11/3) — 만든 사람이 이 캐릭터만의 장면을 이름 + 설명으로 적는다. 채팅 사진 시트에 기본 장면과 함께 나오고,
 * 고르면 설명이 그림 태그로 바뀌어 그 장면대로 그린다. 언베일 장면은 언베일이 켜진 대화에서만 보인다.
 */
export function PhotoScenesEditor({ defaultValue }: { defaultValue: CustomPhotoScene[] }) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((s, id) => ({ ...s, id })))
  const [nextId, setNextId] = useState(defaultValue.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const value = rows.filter(r => r.label.trim() && r.description.trim()).map(({ id: _id, ...s }) => s)
  const toggle = (on: boolean | undefined) => ({ minHeight: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-lavender-300)' : 'var(--color-border)'}`,
    background: on ? 'color-mix(in srgb, var(--color-lavender-300) 14%, transparent)' : 'transparent', color: on ? 'var(--color-lavender-200)' : 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 13 } as const)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="photoScenes" value={JSON.stringify(value)} />
      {rows.map(r => (
        <div key={r.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={r.label} maxLength={CUSTOM_SCENE_LIMITS.label} placeholder={t('장면 이름 (예: 비 오는 옥상)')} aria-label={t('장면 이름')}
              onChange={e => patch(r.id, { label: e.target.value })} style={{ ...box(false), flex: 1, minWidth: 0, minHeight: 44, padding: '0 12px', borderRadius: 8, fontSize: fieldFont, outline: 'none' }} />
            <button type="button" aria-label={t('장면 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))}
              style={{ width: 36, height: 36, flex: 'none', borderRadius: 18, border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
          <textarea value={r.description} maxLength={CUSTOM_SCENE_LIMITS.description} rows={2} aria-label={t('장면 설명')}
            placeholder={t('예: 비 오는 밤 옥상 난간에 기대 젖은 셔츠 차림으로 담배를 문 채 이쪽을 내려다본다')}
            onChange={e => patch(r.id, { description: e.target.value })} style={{ ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: fieldFont, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" aria-pressed={!!r.couple} onClick={() => patch(r.id, { couple: r.couple ? undefined : true })} style={toggle(r.couple)}>{t('둘이 함께')}</button>
            <button type="button" aria-pressed={!!r.unveil} onClick={() => patch(r.id, { unveil: r.unveil ? undefined : true })} style={toggle(r.unveil)}>{t('언베일 장면')}</button>
          </div>
        </div>
      ))}
      {rows.length < CUSTOM_SCENE_LIMITS.entries && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, label: '', description: '' }]); setNextId(n => n + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 장면 추가')}</button>}
    </div>
  )
}
