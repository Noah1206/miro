'use client'
import { useState } from 'react'
import type { CharacterStat } from '@miro/domain'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont } from './form-parts'

export const STAT_LIMIT = 7
export const STATUS_FORMAT_LIMIT = 1000

type Row = { id: number; name: string; min: string; max: string; def: string; unit: string; description: string }

/** 상태창 예시 틀(11/10, 크랙 INFO 블록) — 빈 칸에서 시작하기 어려운 사람을 위해 장르별로 하나씩. */
const EXAMPLES: Array<[string, string]> = [
  ['RPG', 'D+[며칠째] | [날짜] | [시각] | [날씨] | [장소]\n━━━━━━━━━━\n[사용자 이름] · [직업/클래스] · Lv.[레벨]\nHP [값]/100 | MP [값]/100\n아이템: [가진 것]\n퀘스트: [진행 중인 것]'],
  ['로맨스', '[날짜] [시각] · [장소]\n━━━━━━━━━━\n[상대 이름] 호감도 [값]/100 · [관계 단계]\n지금 기분: [한 줄]'],
  ['시뮬레이션', '[n]일째 | [시각] | [장소]\n━━━━━━━━━━\n[핵심 수치들]\n오늘 할 일: [목록]\n최근 사건: [한 줄]'],
]

/**
 * 상태창·스탯(11/10) — 매 답변 끝에 붙는 상태창의 틀과, 대화방마다 움직이는 수치(최대 7개).
 * AI 는 형식을 채우고 스탯 새 값을 내며, 서버가 범위로 자른다. 비워 두면 상태창이 없다.
 */
export function StatusEditor({ defaultFormat, defaultStats }: { defaultFormat: string; defaultStats: CharacterStat[] }) {
  const t = useT()
  const [format, setFormat] = useState(defaultFormat)
  const [rows, setRows] = useState<Row[]>(() => defaultStats.map((s, id) => ({ id, name: s.name, min: String(s.min), max: String(s.max), def: String(s.default), unit: s.unit ?? '', description: s.description })))
  const [nextId, setNextId] = useState(defaultStats.length)
  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const num = (v: string, d: number) => (v.trim() === '' || Number.isNaN(Number(v)) ? d : Number(v))
  const value = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), min: num(r.min, 0), max: num(r.max, 100), default: num(r.def, 0), unit: r.unit.trim() || undefined, description: r.description.trim() }))
  const input = { ...box(false), minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: fieldFont, outline: 'none', minWidth: 0 } as const
  return (
    <div className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="stats" value={JSON.stringify(value)} />
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('예시로 시작')}</span>
          {EXAMPLES.map(([label, text]) => <button key={label} type="button" onClick={() => setFormat(text)}
            style={{ minHeight: 30, padding: '0 12px', borderRadius: 999, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>{t(label)}</button>)}
        </div>
        <textarea name="statusFormat" value={format} maxLength={STATUS_FORMAT_LIMIT} rows={7} aria-label={t('상태창 형식')}
          placeholder={t('대괄호 안은 AI가 매번 채우는 칸이에요. 예) [날짜] | [장소] | 호감도 [값]/100')}
          onChange={e => setFormat(e.target.value)}
          style={{ ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
        <span style={{ alignSelf: 'flex-end', fontSize: 12, color: 'var(--color-text-tertiary, var(--color-text-secondary))' }}>{format.length} / {STATUS_FORMAT_LIMIT}</span>
      </div>
      {rows.map(r => (
        <div key={r.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={r.name} maxLength={10} placeholder={t('스탯 이름 (예: 호감도)')} aria-label={t('스탯 이름')} onChange={e => patch(r.id, { name: e.target.value })} style={{ ...input, flex: 1 }} />
            <button type="button" aria-label={t('스탯 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))}
              style={{ width: 36, height: 36, flex: 'none', borderRadius: 18, border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            <input value={r.min} inputMode="numeric" placeholder={t('최소')} aria-label={t('최소')} onChange={e => patch(r.id, { min: e.target.value })} style={input} />
            <input value={r.max} inputMode="numeric" placeholder={t('최대')} aria-label={t('최대')} onChange={e => patch(r.id, { max: e.target.value })} style={input} />
            <input value={r.def} inputMode="numeric" placeholder={t('기본값')} aria-label={t('기본값')} onChange={e => patch(r.id, { def: e.target.value })} style={input} />
            <input value={r.unit} maxLength={3} placeholder={t('단위')} aria-label={t('단위')} onChange={e => patch(r.id, { unit: e.target.value })} style={input} />
          </div>
          <textarea value={r.description} maxLength={500} rows={2} aria-label={t('스탯 설명')}
            placeholder={t('AI가 언제 올리고 내릴지 적어 주세요. 예) 칭찬하거나 도와주면 오르고, 약속을 어기면 내려요.')}
            onChange={e => patch(r.id, { description: e.target.value })} style={{ ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: fieldFont, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
        </div>
      ))}
      {rows.length < STAT_LIMIT && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, name: '', min: '0', max: '100', def: '0', unit: '', description: '' }]); setNextId(n => n + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 스탯 추가')} ({rows.length}/{STAT_LIMIT})</button>}
    </div>
  )
}
