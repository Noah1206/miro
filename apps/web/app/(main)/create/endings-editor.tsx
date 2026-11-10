'use client'
import { useState } from 'react'
import type { CharacterEnding } from '@miro/domain'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont } from './form-parts'

export const ENDING_LIMIT = 10
const GRADES: CharacterEnding['grade'][] = ['N', 'R', 'SR', 'SSR']
type Row = { id: number; name: string; grade: CharacterEnding['grade']; minTurns: string; condition: string; epilogue: string; hint: string }

/**
 * 엔딩(11/10, 크랙 엔딩 설정) — 최대 10개. 최소 턴이 지나고 조건이 장면에서 충족되면 AI 가 결말 표식을 남기고,
 * 대화 화면엔 등급이 붙은 엔딩 카드가 뜬다. 힌트는 사용자에게 보여서 다른 엔딩을 찾고 싶게 한다.
 */
export function EndingsEditor({ defaultValue }: { defaultValue: CharacterEnding[] }) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((e, id) => ({ id, name: e.name, grade: e.grade, minTurns: String(e.minTurns), condition: e.condition, epilogue: e.epilogue ?? '', hint: e.hint ?? '' })))
  const [nextId, setNextId] = useState(defaultValue.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const value = rows.filter(r => r.name.trim() && r.condition.trim()).map(r => ({
    name: r.name.trim(), grade: r.grade, minTurns: Math.max(10, Number(r.minTurns) || 10), condition: r.condition.trim(),
    ...(r.epilogue.trim() ? { epilogue: r.epilogue.trim() } : {}), ...(r.hint.trim() ? { hint: r.hint.trim() } : {}),
  }))
  const input = { ...box(false), minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: fieldFont, outline: 'none', minWidth: 0 } as const
  const area = { ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: fieldFont, resize: 'vertical', outline: 'none', fontFamily: 'inherit' } as const
  const chip = (on: boolean) => ({ minHeight: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`,
    background: on ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 600 } as const)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="endings" value={JSON.stringify(value)} />
      {rows.map(r => (
        <div key={r.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={r.name} maxLength={20} placeholder={t('엔딩 이름 (예: 내일이 온다)')} aria-label={t('엔딩 이름')} onChange={e => patch(r.id, { name: e.target.value })} style={{ ...input, flex: 1 }} />
            <button type="button" aria-label={t('엔딩 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))}
              style={{ width: 36, height: 36, flex: 'none', borderRadius: 18, border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginRight: 2 }}>{t('등급')}</span>
            {GRADES.map(g => <button key={g} type="button" aria-pressed={r.grade === g} onClick={() => patch(r.id, { grade: g })} style={chip(r.grade === g)}>{g}</button>)}
            <span style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {t('최소 턴')}<input value={r.minTurns} inputMode="numeric" aria-label={t('최소 턴')} onChange={e => patch(r.id, { minTurns: e.target.value })} style={{ ...input, width: 64 }} />
            </label>
          </div>
          <textarea value={r.condition} maxLength={500} rows={2} aria-label={t('엔딩 조건')} placeholder={t('어떤 일이 일어나면 이 엔딩인가요? 예) 피오와 카라가 모두 살아 있고 잿빛 뿔을 물리쳤다.')}
            onChange={e => patch(r.id, { condition: e.target.value })} style={area} />
          <textarea value={r.epilogue} maxLength={1000} rows={2} aria-label={t('에필로그')} placeholder={t('에필로그 분위기 (선택) — AI가 결말 장면을 이 느낌으로 맺어요.')}
            onChange={e => patch(r.id, { epilogue: e.target.value })} style={area} />
          <input value={r.hint} maxLength={20} placeholder={t('엔딩 힌트 (선택, 사용자에게 보여요)')} aria-label={t('엔딩 힌트')} onChange={e => patch(r.id, { hint: e.target.value })} style={input} />
        </div>
      ))}
      {rows.length < ENDING_LIMIT && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, name: '', grade: 'N', minTurns: '10', condition: '', epilogue: '', hint: '' }]); setNextId(n => n + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 엔딩 추가')} ({rows.length}/{ENDING_LIMIT})</button>}
    </div>
  )
}
