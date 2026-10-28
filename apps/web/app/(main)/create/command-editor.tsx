'use client'
import { useEffect, useState } from 'react'
import type { CharacterCommand } from '@miro/db'
import { Sheet, Switch } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { markCommandUsed, removeCommand, saveCommand, searchCommands, type LibraryCommand } from './commands'
import { box, fieldFont } from './form-parts'
import { COMMAND_LIMITS } from './parse'

/**
 * 명령어(10/19) — 채팅에서 `/이름` 으로 부르는 한 턴 지시. 라이브러리(누구나 공개)에서 골라 붙이거나 직접 만든다.
 * 캐릭터에는 복사본이 붙어 hidden JSON 으로 제출된다 — 원본이 바뀌어도 캐릭터는 그대로다.
 */
export function CommandEditor({ name, defaultValue = [] }: { name: string; defaultValue?: CharacterCommand[] }) {
  const t = useT()
  const [items, setItems] = useState<CharacterCommand[]>(defaultValue)
  const [picking, setPicking] = useState(false)
  const [making, setMaking] = useState(false)
  const full = items.length >= COMMAND_LIMITS.count
  const add = (cmd: CharacterCommand) => {
    if (full || items.some(i => i.name === cmd.name)) return false
    setItems(prev => [...prev, { name: cmd.name, hint: cmd.hint, prompt: cmd.prompt, ...(cmd.sourceId ? { sourceId: cmd.sourceId } : {}) }])
    return true
  }
  const remove = (n: number) => setItems(prev => prev.filter((_, i) => i !== n))
  const btn: React.CSSProperties = { flex: 1, minHeight: 44, padding: '10px 12px', borderRadius: 'var(--radius-button)', border: 0, cursor: 'pointer', background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)' }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.length > 0 && <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
        {items.map((cmd, n) => <li key={cmd.name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', ...box(false) }}>
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <span className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>/{cmd.name}</span>
            {cmd.hint && <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{cmd.hint}</span>}
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap' }}>{cmd.prompt}</span>
          </div>
          <button type="button" onClick={() => remove(n)} aria-label={t('{name} 명령어 빼기', { name: cmd.name })} className="hit"
            style={{ width: 28, height: 28, borderRadius: 14, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </li>)}
      </ul>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={btn} disabled={full} onClick={() => setPicking(true)}>{t('라이브러리에서 고르기')}</button>
        <button type="button" style={btn} disabled={full} onClick={() => setMaking(v => !v)} aria-expanded={making}>{t('직접 만들기')}</button>
      </div>
      <p className="t-micro" style={{ textAlign: 'right', textTransform: 'none', letterSpacing: 0, color: full ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{items.length}/{COMMAND_LIMITS.count}</p>
      {making && <NewCommand onDone={cmd => { add(cmd); setMaking(false) }} />}
      <LibrarySheet open={picking} onClose={() => setPicking(false)} attached={items.map(i => i.name)} onPick={cmd => { if (add(cmd) && cmd.sourceId) void markCommandUsed(cmd.sourceId) }} />
    </div>
  )
}

const field: React.CSSProperties = { width: '100%', background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont, lineHeight: 1.5, fontFamily: 'inherit' }
/** 이 편집기는 캐릭터 폼 안에 있다 — 한 줄 입력에서 Enter 가 캐릭터를 게시해 버리지 않게. */
const noSubmit = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }

function NewCommand({ onDone }: { onDone: (cmd: CharacterCommand) => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [hint, setHint] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const ok = name.trim() && prompt.trim()
  const submit = async () => {
    if (!ok || pending) return
    setPending(true); setError('')
    try { onDone(await saveCommand({ name, hint, prompt, isPublic })) }
    catch { setError(t('지금은 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')) }
    setPending(false)
  }
  return <div className="stack" style={{ gap: 10, padding: '12px', ...box(false) }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', ...box(false) }}>
      <span className="t-body" style={{ color: 'var(--color-text-tertiary)' }}>/</span>
      <input value={name} onKeyDown={noSubmit} onChange={e => setName(e.target.value.replace(/\s+/g, ''))} maxLength={COMMAND_LIMITS.name} placeholder={t('이름 — 예) 일기')} aria-label={t('명령어 이름')} style={field} />
    </div>
    <div style={{ padding: '6px 10px', ...box(false) }}>
      <input value={hint} onKeyDown={noSubmit} onChange={e => setHint(e.target.value)} maxLength={COMMAND_LIMITS.hint} placeholder={t('한 줄 설명 — 예) 오늘 하루를 일기로 돌아본다')} aria-label={t('명령어 설명')} style={field} />
    </div>
    <div style={{ padding: '6px 10px 3px', ...box(false) }}>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} maxLength={COMMAND_LIMITS.prompt} aria-label={t('명령어 지시')}
        placeholder={t('AI에게 줄 프롬프트 — 예) 오늘 하루를 일기 형식으로 돌아보는 장면을 써 줘')} style={{ ...field, resize: 'none' }} />
    </div>
    <Switch name="commandPublic" checked={isPublic} onChange={setIsPublic} label={t('라이브러리에 공개')} hint={t('켜면 다른 제작자도 이 명령어를 자기 캐릭터에 붙일 수 있어요.')} />
    {error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    <button type="button" onClick={() => void submit()} disabled={!ok || pending}
      style={{ minHeight: 44, borderRadius: 'var(--radius-button)', border: 0, cursor: ok ? 'pointer' : 'default', background: ok ? 'var(--color-accent)' : 'var(--color-surface-3)', color: ok ? 'var(--color-accent-on)' : 'var(--color-text-disabled)', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)' }}>
      {pending ? t('저장 중') : t('추가')}
    </button>
  </div>
}

function LibrarySheet({ open, onClose, attached, onPick }: { open: boolean; onClose: () => void; attached: string[]; onPick: (cmd: LibraryCommand) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<LibraryCommand[] | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    const timer = setTimeout(() => { searchCommands(query).then(r => { if (live) setRows(r) }).catch(() => { if (live) setRows([]) }) }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [open, query])
  return <Sheet open={open} onClose={onClose} title={t('명령어 라이브러리')}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 12, ...box(false) }}>
      <input value={query} onKeyDown={noSubmit} onChange={e => setQuery(e.target.value)} placeholder={t('이름이나 설명으로 찾기')} aria-label={t('명령어 찾기')} maxLength={40} style={field} />
    </div>
    {rows === null && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('불러오는 중…')}</p>}
    {rows?.length === 0 && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('아직 공개된 명령어가 없어요. 직접 만들어 첫 번째로 올려 보세요.')}</p>}
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
      {rows?.map(cmd => {
        const on = attached.includes(cmd.name)
        return <li key={cmd.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', ...box(false) }}>
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <span className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>/{cmd.name}</span>
            {cmd.hint && <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{cmd.hint}</span>}
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap' }}>{cmd.prompt}</span>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{cmd.mine ? t('내가 만듦') : cmd.owner ?? t('익명')} · {t('{n}번 사용', { n: cmd.uses })}</span>
          </div>
          <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
            <button type="button" disabled={on} onClick={() => onPick(cmd)} className="hit"
              style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 0, cursor: on ? 'default' : 'pointer', background: on ? 'var(--color-surface-3)' : 'var(--color-accent)', color: on ? 'var(--color-text-disabled)' : 'var(--color-accent-on)', fontSize: 13, fontWeight: 'var(--weight-semibold)' }}>
              {on ? t('붙임') : t('붙이기')}
            </button>
            {cmd.mine && <button type="button" onClick={() => { void removeCommand(cmd.id); setRows(r => r?.filter(x => x.id !== cmd.id) ?? r) }} className="t-micro hit"
              style={{ background: 'none', border: 0, padding: '2px 4px', color: 'var(--color-text-tertiary)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>{t('내리기')}</button>}
          </div>
        </li>
      })}
    </ul>
  </Sheet>
}
