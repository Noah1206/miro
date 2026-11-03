'use client'
import { useState } from 'react'
import { PERSONA_LIMITS, PRESET_PERSONA_LIMIT, type UserPersona } from '@miro/domain'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont } from './form-parts'

type Row = { id: number; name: string; gender: UserPersona['gender']; description: string }
const GENDERS: Array<[UserPersona['gender'], string]> = [[null, '밝히지 않음'], ['female', '여성'], ['male', '남성']]

/**
 * 준비된 페르소나(11/3) — 만든 사람이 이 이야기에 어울리는 '나'를 이름·성별·소개로 적어 둔다. 대화 시작 화면에서 사용자가 골라 쓴다.
 * 모양은 사진 장면 편집기와 같다.
 */
export function PresetPersonasEditor({ defaultValue }: { defaultValue: UserPersona[] }) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((p, id) => ({ id, name: p.name, gender: p.gender, description: p.description ?? '' })))
  const [nextId, setNextId] = useState(defaultValue.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const value = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), gender: r.gender, description: r.description.trim() || null }))
  const chip = (on: boolean) => ({ minHeight: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-lavender-300)' : 'var(--color-border)'}`,
    background: on ? 'color-mix(in srgb, var(--color-lavender-300) 14%, transparent)' : 'transparent', color: on ? 'var(--color-lavender-200)' : 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 13 } as const)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="presetPersonas" value={JSON.stringify(value)} />
      {rows.map(r => (
        <div key={r.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={r.name} maxLength={PERSONA_LIMITS.name} placeholder={t('이름 (예: 신입 사원 지우)')} aria-label={t('페르소나 이름')}
              onChange={e => patch(r.id, { name: e.target.value })} style={{ ...box(false), flex: 1, minWidth: 0, minHeight: 44, padding: '0 12px', borderRadius: 8, fontSize: fieldFont, outline: 'none' }} />
            <button type="button" aria-label={t('페르소나 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))}
              style={{ width: 36, height: 36, flex: 'none', borderRadius: 18, border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GENDERS.map(([g, label]) => <button key={label} type="button" aria-pressed={r.gender === g} onClick={() => patch(r.id, { gender: g })} style={chip(r.gender === g)}>{t(label)}</button>)}
          </div>
          <textarea value={r.description} maxLength={PERSONA_LIMITS.description} rows={2} aria-label={t('페르소나 소개')}
            placeholder={t('예: 스물여섯, 입사 3개월 차 신입. 팀장에게 매일 기획서를 돌려받는다.')}
            onChange={e => patch(r.id, { description: e.target.value })} style={{ ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: fieldFont, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
        </div>
      ))}
      {rows.length < PRESET_PERSONA_LIMIT && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, name: '', gender: null, description: '' }]); setNextId(n => n + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 페르소나 추가')}</button>}
    </div>
  )
}
