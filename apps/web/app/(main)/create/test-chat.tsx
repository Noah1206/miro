'use client'
import { useRef, useState } from 'react'
import { Line } from '../character/[slug]/sections'
import { useT } from '@/lib/i18n/client'
import { testTurn, type TestBlock, type TestTurnMessage } from './assist'
import { serializableDraft } from './draft-storage'
import { box } from './form-parts'
import { TEST_CHAT_LIMIT } from './parse'

type Shown = { role: 'user' | 'narrator' | 'character'; blocks: TestBlock[] }

/**
 * 등록 전 테스트 채팅(10/19) — 폼에 적힌 지금 설정으로 실제 대사 파이프라인을 돌려 본다. 아무것도 저장하지 않는다.
 * 인트로는 그대로 맨 위에 깔리고, 보낼 때마다 폼을 다시 읽으므로 칸을 고치고 바로 다시 물어볼 수 있다.
 */
export function TestChat({ form, name, intro }: {
  form: () => HTMLFormElement | null; name: string
  intro: Array<{ role: 'character' | 'narrator'; text: string }>
}) {
  const t = useT()
  const [shown, setShown] = useState<Shown[]>([])
  const [history, setHistory] = useState<TestTurnMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const who = name || t('캐릭터')
  const used = history.filter(m => m.role === 'user').length
  const left = TEST_CHAT_LIMIT - used

  const send = async () => {
    const text = draft.trim()
    const el = form()
    if (!text || pending || left <= 0 || !el) return
    setPending(true); setError(''); setDraft('')
    setShown(s => [...s, { role: 'user', blocks: [{ type: 'dialogue', text }] }])
    const result = await testTurn(serializableDraft(el), history, text)
    if ('error' in result) { setError(result.error); setShown(s => s.slice(0, -1)); setDraft(text) }
    else {
      setShown(s => [...s, { role: 'character', blocks: result.blocks }])
      setHistory(h => [...h, { role: 'user', text }, { role: 'character', text: result.blocks.map(b => b.text).join('\n') }])
    }
    setPending(false)
  }
  const reset = () => { setShown([]); setHistory([]); setError('') }

  const bubble = (m: Shown, i: number) => {
    if (m.role === 'user') return <li key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%', background: 'var(--color-surface-3)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 14 }}><Line text={m.blocks[0]!.text} /></div>
    </li>
    if (m.role === 'narrator') return <li key={i} style={{ padding: '0 6%', textAlign: 'center', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 14 }}><Line text={m.blocks[0]!.text} /></li>
    return <li key={i} className="stack" style={{ gap: 6 }}>
      <p className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-secondary)' }}>{who}</p>
      {m.blocks.map((b, n) => b.type === 'dialogue' || b.type === 'npc'
        ? <div key={n} style={{ maxWidth: '84%', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 14 }}><Line text={b.text} /></div>
        : <div key={n} style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '0 2px' }}><Line text={b.text} /></div>)}
    </li>
  }

  return (
    <div aria-label={t('테스트 채팅')} className="stack" style={{ gap: 12, marginTop: 20 }}>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('지금 적은 설정으로 바로 이야기해 보세요. 테스트 대화는 저장되지 않아요.')}</p>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 12 }}>
        {intro.map((turn, i) => bubble({ role: turn.role, blocks: [{ type: turn.role === 'narrator' ? 'narrative' : 'dialogue', text: turn.text }] }, -i - 1))}
        {shown.map(bubble)}
        {pending && <li className="t-caption" style={{ color: 'var(--color-text-tertiary)' }} role="status">{t('{name}이(가) 쓰는 중…', { name: who })}</li>}
      </ul>
      {error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(error)}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={500} disabled={pending || left <= 0}
          aria-label={t('테스트 메시지')} placeholder={left <= 0 ? t('테스트 대화는 10번까지예요. 게시하면 계속 이야기할 수 있어요.') : t('메시지를 입력하세요')}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', ...box(false) }} />
        <button type="button" onClick={() => void send()} disabled={!draft.trim() || pending || left <= 0} aria-label={t('보내기')}
          style={{ width: 44, height: 44, borderRadius: 22, border: 0, flexShrink: 0, display: 'grid', placeItems: 'center', cursor: draft.trim() && !pending && left > 0 ? 'pointer' : 'default',
            background: draft.trim() && !pending && left > 0 ? 'var(--color-accent)' : 'var(--color-surface-2)', color: draft.trim() && !pending && left > 0 ? 'var(--color-accent-on)' : 'var(--color-text-disabled)' }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: left <= 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{used}/{TEST_CHAT_LIMIT}</span>
        {shown.length > 0 && <button type="button" onClick={reset} className="t-caption hit" style={{ background: 'none', border: 0, padding: '2px 4px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>{t('처음부터 다시')}</button>}
      </div>
    </div>
  )
}
