'use client'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { deleteMemory, editMemory } from './actions'
import styles from './memory.module.css'

const Icon = ({ d }: { d: string }) => <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const PENCIL = 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4', TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3', CHECK = 'M5 12.5l4.5 4.5L19 7.5', CLOSE = 'M6 6l12 12M18 6L6 18'

/**
 * 11/24 사용자: 기억 직접 고치기 — 장기 기억 한 줄 옆의 연필·휴지통 아이콘. 고치기는 그 자리에서, 지우기는 한 번 더 묻는다(되돌릴 수 없다).
 * 11/17 '보기만' 결정을 사용자가 바꿨다. 요약·지난 이야기는 AI 가 다시 쓰는 글이라 고치지 않는다.
 */
export function MemoryItem({ sessionId, id, text }: { sessionId: string; id: string; text: string }) {
  const t = useT()
  const toast = useToast()
  const [mode, setMode] = useState<'view' | 'edit' | 'ask'>('view')
  const [shown, setShown] = useState(text)
  const [value, setValue] = useState(text)
  const [pending, setPending] = useState(false)
  const [gone, setGone] = useState(false)
  useEffect(() => { setShown(text) }, [text])
  if (gone) return null
  const save = async () => {
    const next = value.trim()
    if (!next || next === shown) { setMode('view'); return }
    setPending(true)
    const r = await editMemory(sessionId, id, next).catch(() => ({ ok: false as const, error: '기억을 고칠 수 없어요.' }))
    setPending(false)
    if (!r.ok) { toast(t(r.error), 'error'); return }
    setShown(r.content); setMode('view')
  }
  const remove = async () => {
    setPending(true)
    const r = await deleteMemory(sessionId, id).catch(() => ({ ok: false as const, error: '기억을 지울 수 없어요.' }))
    setPending(false)
    if (!r.ok) { toast(t(r.error), 'error'); setMode('view'); return }
    setGone(true)
  }
  return (
    <li className={styles.item}>
      {mode === 'edit'
        ? <textarea className={styles.itemEdit} value={value} maxLength={300} rows={2} autoFocus aria-label={t('기억 고치기')} disabled={pending} onChange={e => setValue(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Escape') setMode('view') }} />
        : <span className={styles.itemText}>{shown}{mode === 'ask' && <span className={styles.itemAsk}>{t('이 기억을 지울까요? 되돌릴 수 없어요.')}</span>}</span>}
      <span className={styles.itemTools}>
        {mode === 'view' ? <>
          <button type="button" className={styles.iconBtn} aria-label={t('기억 고치기')} title={t('기억 고치기')} onClick={() => { setValue(shown); setMode('edit') }}><Icon d={PENCIL} /></button>
          <button type="button" className={styles.iconBtn} aria-label={t('기억 지우기')} title={t('기억 지우기')} onClick={() => setMode('ask')}><Icon d={TRASH} /></button>
        </> : <>
          <button type="button" className={styles.iconBtn} data-danger={mode === 'ask' || undefined} disabled={pending} aria-label={mode === 'ask' ? t('지우기') : t('저장')} title={mode === 'ask' ? t('지우기') : t('저장')} onClick={mode === 'ask' ? remove : save}><Icon d={CHECK} /></button>
          <button type="button" className={styles.iconBtn} disabled={pending} aria-label={t('취소')} title={t('취소')} onClick={() => setMode('view')}><Icon d={CLOSE} /></button>
        </>}
      </span>
    </li>
  )
}
