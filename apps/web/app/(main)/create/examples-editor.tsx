'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont } from './form-parts'

type Turn = { role: 'character' | 'user' | 'narrator'; text: string }
type Pair = { id: number; user: string; character: string }
const LIMIT = 3

/**
 * 전개 예시(11/10, 크랙 스토리 설정) — 유저가 이렇게 말하면 캐릭터는 이렇게 답한다, 최대 3쌍. 말투·분량의 기준이 된다(엔진 sampleLines).
 * 예전에 숨은 칸으로만 오가던 상황 예시를 그대로 이어받는다 — 쌍으로 안 묶이는 줄(서술 등)은 손대지 않고 뒤에 붙여 둔다.
 */
export function ExamplesEditor({ defaultValue, characterName }: { defaultValue: Turn[]; characterName: string }) {
  const t = useT()
  const [{ pairs, extra }] = useState(() => split(defaultValue))
  const [rows, setRows] = useState<Pair[]>(pairs)
  const [nextId, setNextId] = useState(pairs.length)
  const patch = (id: number, p: Partial<Pair>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const value: Turn[] = [...rows.flatMap(r => [
    ...(r.user.trim() ? [{ role: 'user' as const, text: r.user.trim() }] : []),
    ...(r.character.trim() ? [{ role: 'character' as const, text: r.character.trim() }] : []),
  ]), ...extra]
  const area = { ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: fieldFont, resize: 'vertical', outline: 'none', fontFamily: 'inherit' } as const
  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="sampleDialogue" value={JSON.stringify(value)} />
      {rows.map((r, n) => (
        <div key={r.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 13 }}>{t('예시 {n}', { n: n + 1 })}</strong>
            <button type="button" aria-label={t('예시 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))}
              style={{ width: 32, height: 32, borderRadius: 16, border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
          <textarea value={r.user} maxLength={500} rows={2} aria-label={t('유저')} placeholder={t('유저가 하는 말·행동')} onChange={e => patch(r.id, { user: e.target.value })} style={area} />
          <textarea value={r.character} maxLength={500} rows={3} aria-label={characterName || t('캐릭터')}
            placeholder={t('{name}의 답 — 말투·분량의 기준이 돼요', { name: characterName || t('캐릭터') })} onChange={e => patch(r.id, { character: e.target.value })} style={area} />
        </div>
      ))}
      {rows.length < LIMIT && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, user: '', character: '' }]); setNextId(x => x + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 예시 추가')} ({rows.length}/{LIMIT})</button>}
    </div>
  )
}

/** 저장된 상황 예시 → 유저·캐릭터 쌍(최대 3) + 쌍으로 안 묶이는 나머지(그대로 보존). */
function split(turns: Turn[]): { pairs: Pair[]; extra: Turn[] } {
  const pairs: Pair[] = [], extra: Turn[] = []
  for (let i = 0; i < turns.length; i++) {
    const a = turns[i]!, b = turns[i + 1]
    if (pairs.length < LIMIT && a.role === 'user' && b?.role === 'character') { pairs.push({ id: pairs.length, user: a.text, character: b.text }); i++ }
    else extra.push(a)
  }
  return { pairs, extra }
}
