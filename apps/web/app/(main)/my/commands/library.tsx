'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { removeCommand, searchCommands, type LibraryCommand } from '@/app/(main)/create/commands'
import { NewCommand } from '@/app/(main)/create/command-editor'
import { box } from '@/app/(main)/create/form-parts'

/**
 * 11/22 명령어 라이브러리 — 찾기(이름·설명, 많이 쓰인 순) · 전체/내 명령어 · 직접 만들기 · 내가 올린 것 내리기.
 * 채팅방에서는 `/` 목록에서 같은 라이브러리를 골라 쓴다(공개 또는 내 것만 실행된다, chat-command.ts).
 */
export function CommandLibrary({ adultAllowed }: { adultAllowed: boolean }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<LibraryCommand[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [mineOnly, setMineOnly] = useState(false)
  const [making, setMaking] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let live = true
    setFailed(false)
    const timer = setTimeout(() => {
      searchCommands(query).then(r => { if (live) setRows(r) }).catch(() => { if (live) { setRows([]); setFailed(true) } })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query, retry])

  const shown = rows?.filter(r => !mineOnly || r.mine) ?? null
  const tab = (on: boolean, label: string, onClick: () => void) => <button type="button" aria-pressed={on} onClick={onClick}
    style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 14,
      background: on ? 'var(--color-text-primary)' : 'var(--color-surface-3)', color: on ? 'var(--color-bg)' : 'var(--color-text-secondary)' }}>{label}</button>

  return <div className="stack" style={{ gap: 14 }}>
    <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
      {t('명령어는 채팅에서 / 로 부르는 한 턴 지시예요. 공개된 명령어는 누구나 채팅방이나 자기 캐릭터에서 쓸 수 있어요.')}
    </p>
    <div style={{ padding: '10px 12px', ...box(false) }}>
      <input value={query} onChange={e => setQuery(e.target.value)} maxLength={40} placeholder={t('이름이나 설명으로 찾기')} aria-label={t('명령어 찾기')}
        style={{ width: '100%', background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 15, fontFamily: 'inherit' }} />
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {tab(!mineOnly, t('전체'), () => setMineOnly(false))}
      {tab(mineOnly, t('내 명령어'), () => setMineOnly(true))}
      <button type="button" onClick={() => setMaking(v => !v)} aria-expanded={making}
        style={{ marginLeft: 'auto', minHeight: 36, padding: '0 14px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 14, background: 'var(--color-accent)', color: 'var(--color-accent-on)' }}>
        {making ? t('닫기') : `＋ ${t('직접 만들기')}`}
      </button>
    </div>
    {making && <NewCommand adultAllowed={adultAllowed} onDone={cmd => {
      setMaking(false)
      // 방금 만든 것을 목록 맨 앞에(다시 불러오지 않아도 보이게).
      if (cmd.sourceId) setRows(prev => [{ id: cmd.sourceId!, sourceId: cmd.sourceId, name: cmd.name, hint: cmd.hint, prompt: cmd.prompt, uses: 0, mine: true, owner: null }, ...(prev ?? [])])
    }} />}

    {failed ? <button type="button" onClick={() => setRetry(v => v + 1)} className="t-body" style={{ minHeight: 44, border: 0, borderRadius: 'var(--radius-button)', background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>{t('다시 불러오기')}</button>
      : shown === null ? <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('불러오는 중…')}</p>
      : shown.length === 0 ? <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{mineOnly ? t('아직 만든 명령어가 없어요.') : t('명령어가 없어요.')}</p>
      : <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
        {shown.map(cmd => <li key={cmd.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', ...box(false) }}>
          <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
            <span className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>/{cmd.name}</span>
            {cmd.hint && <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{cmd.hint}</span>}
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cmd.prompt}</span>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
              {cmd.mine ? t('내 명령어') : cmd.owner ?? t('알 수 없음')} · {t('{n}회 사용', { n: cmd.uses.toLocaleString() })}
            </span>
          </div>
          {cmd.mine && <button type="button" onClick={() => { void removeCommand(cmd.id); setRows(r => r?.filter(x => x.id !== cmd.id) ?? r) }}
            style={{ flex: 'none', minHeight: 32, padding: '0 12px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 13, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)' }}>
            {t('내리기')}
          </button>}
        </li>)}
      </ul>}
  </div>
}
