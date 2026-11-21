'use client'
import { useState } from 'react'
import type { NovelChapter } from '@miro/db'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import type { NovelTurn, NovelView } from '@/lib/novel'
import form from '@/app/(main)/persona/form.module.css'
import { deleteChapterAction, saveChapterAction } from './actions'

const TITLE_MAX = 60

/**
 * 11/21 사용자: 웹소설은 유저가 직접 엮는다 — 화를 만들고, 화 이름을 정하고, 대화 목록에서 골라 넣는다(본문 = 대화 원문 그대로, AI 를 부르지 않아 토큰이 들지 않는다).
 * 한 턴은 여러 화에 넣을 수 있다(어느 화에 들어 있는지 표시).
 */
export function NovelReader({ sessionId, initial, turns }: { sessionId: string; initial: NovelView; turns: NovelTurn[] }) {
  const t = useT()
  const [chapters, setChapters] = useState<NovelChapter[]>(initial.chapters)
  // editing: null = 목록, 0 = 새 화, n = n화 고치기
  const [editing, setEditing] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const open = (c?: NovelChapter) => {
    setEditing(c?.n ?? 0); setTitle(c?.title ?? ''); setPicked(new Set(c?.turns ?? [])); setError(null)
  }
  const toggle = (turn: number) => setPicked(prev => { const next = new Set(prev); if (next.has(turn)) next.delete(turn); else next.add(turn); return next })
  const inChapters = (turn: number) => chapters.filter(c => c.n !== editing && c.turns?.includes(turn)).map(c => c.n)

  async function save() {
    if (!title.trim() || !picked.size) { setError(t('화 이름을 적고 대화를 하나 이상 골라 주세요.')); return }
    setBusy(true); setError(null)
    const r = await saveChapterAction(sessionId, { n: editing || undefined, title, turns: [...picked] })
    setBusy(false)
    if ('chapters' in r && r.chapters) { setChapters(r.chapters); setEditing(null) } else setError(t('저장하지 못했어요. 다시 시도해 주세요.'))
  }
  async function remove(n: number) {
    if (confirmDelete !== n) { setConfirmDelete(n); return }
    setConfirmDelete(null)
    const r = await deleteChapterAction(sessionId, n)
    if ('chapters' in r && r.chapters) setChapters(r.chapters)
  }
  function download() {
    const body = [initial.title, '', ...chapters.map(c => `${c.n}화. ${c.title}\n\n${c.text}\n`)].join('\n')
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${initial.title.replace(/[\\/:*?"<>|]/g, '_')}.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }

  if (editing !== null) return (
    <div className={form.form}>
      <div className={form.group}>
        <label htmlFor="novel-title" className={form.label}>{t('화 이름')}<b aria-hidden>*</b></label>
        <input id="novel-title" className={form.input} value={title} maxLength={TITLE_MAX} autoComplete="off" placeholder={t('예: 비 오는 날의 고백')}
          onChange={e => { setTitle(e.target.value); setError(null) }} />
        <span className={form.count}>{title.length}/{TITLE_MAX}</span>
      </div>
      <div className={form.group}>
        <span className={form.label}>{t('넣을 대화')}<b aria-hidden>*</b></span>
        {turns.length === 0 && <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>{t('아직 넣을 대화가 없어요.')}</p>}
        <div className="stack" style={{ gap: 8 }}>
          {turns.map(x => {
            const on = picked.has(x.turn), used = inChapters(x.turn)
            return <button key={x.turn} type="button" aria-pressed={on} onClick={() => toggle(x.turn)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '12px 14px', border: 0, borderRadius: 12, background: on ? 'color-mix(in srgb, var(--color-lavender-500) 22%, #333335)' : '#333335', boxShadow: on ? 'inset 0 0 0 1.5px var(--color-lavender-500)' : 'none', color: 'var(--color-text-primary)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <span aria-hidden style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 22, height: 22, marginTop: 1, borderRadius: 6, background: on ? 'var(--color-lavender-500)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--color-text-primary)', fontSize: 14, fontWeight: 700 }}>{on ? '✓' : ''}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                <strong style={{ fontSize: 14 }}>{x.turn === 0 ? t('인트로') : t('{n}번째 대화', { n: x.turn })}{used.length > 0 && <span style={{ fontWeight: 400, opacity: .7 }}> · {used.map(n => t('{n}화', { n })).join(', ')}{t('에 들어 있음')}</span>}</strong>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-primary)', opacity: .85 }}>{x.preview}</span>
              </span>
            </button>
          })}
        </div>
      </div>
      {error && <p role="alert" className="t-caption" style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}
      <div className="stack" style={{ gap: 8 }}>
        <Button variant="primary" full status={busy ? 'loading' : 'idle'} onClick={() => void save()}>{t('저장')}</Button>
        <Button variant="ghost" full onClick={() => setEditing(null)}>{t('취소')}</Button>
      </div>
    </div>
  )

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="stack" style={{ gap: 8 }}>
        <Button variant="primary" full onClick={() => open()}>{t('+ 화 추가')}</Button>
        {chapters.length > 0 && <Button variant="secondary" full onClick={download}>{t('TXT로 받기')}</Button>}
      </div>
      {chapters.length === 0 && <p className="t-caption" style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('화를 추가하고 이름을 정한 뒤, 넣을 대화를 골라 주세요.')}</p>}
      {chapters.length > 0 && <nav aria-label={t('목차')} className="stack" style={{ gap: 4 }}>
        {chapters.map(c => <a key={c.n} href={`#novel-${c.n}`} className="t-caption" style={{ color: 'var(--color-text-primary)' }}>{t('{n}화', { n: c.n })} · {c.title}</a>)}
      </nav>}
      {chapters.map(c => (
        <article key={c.n} id={`novel-${c.n}`} className="stack" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className="t-title-3" style={{ flex: 1, minWidth: 0, margin: 0 }}>{t('{n}화', { n: c.n })} · {c.title}</h2>
            <button type="button" onClick={() => open(c)} style={{ minHeight: 36, padding: '0 8px', border: 0, background: 'none', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 14, cursor: 'pointer' }}>{t('수정')}</button>
            <button type="button" onClick={() => void remove(c.n)} style={{ minHeight: 36, padding: '0 8px', border: 0, background: 'none', color: confirmDelete === c.n ? 'var(--color-danger)' : 'var(--color-text-primary)', font: 'inherit', fontSize: 14, cursor: 'pointer' }}>{confirmDelete === c.n ? t('한 번 더 누르면 지워요') : t('삭제')}</button>
          </div>
          <div className="t-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.85 }}>{c.text}</div>
        </article>
      ))}
    </div>
  )
}
