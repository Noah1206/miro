'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { SelectField } from '../../../create/settings-controls'
import { deletePreset, listPresets, savePreset, saveRoomNote, type NotePreset } from './actions'
import styles from '../memory/memory.module.css'
import form from '@/app/(main)/persona/form.module.css'

const MAX = 2000, TITLE_MAX = 40, NEW = 'new'

/**
 * 11/17 유저노트 편집기 — 만들기 화면과 같은 입력 칸(.create-page 토큰).
 * 위: 보관함 드롭다운(고르면 제목·내용이 채워진다) → 제목 → 내용. 저장하면 이 대화에 적용되고, 제목이 있으면 보관함에도 저장(고른 노트면 고친다).
 */
export function NoteEditor({ sessionId, initial, initialPresets }: { sessionId: string; initial: string; initialPresets: NotePreset[] }) {
  const t = useT()
  const [presets, setPresets] = useState(initialPresets)
  const start = initialPresets.find(p => p.content.trim() === initial.trim() && initial.trim())
  const [picked, setPicked] = useState(start?.id ?? NEW)
  const [title, setTitle] = useState(start?.title ?? '')
  const [text, setText] = useState(initial)
  const [applied, setApplied] = useState(initial.trim())
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const current = presets.find(p => p.id === picked)
  const changed = text.trim() !== applied || (!!title.trim() && (!current || current.title !== title.trim() || current.content.trim() !== text.trim()))

  const pick = (id: string) => {
    setPicked(id); setConfirm(false); setStatus(null)
    const p = presets.find(x => x.id === id)
    setTitle(p?.title ?? ''); setText(p?.content ?? '')
  }
  const save = async () => {
    setBusy(true); setStatus(null)
    const ok = await saveRoomNote(sessionId, text).catch(() => false)
    let message = ok ? t('이 대화에 적용했어요.') : t('저장하지 못했어요. 다시 시도해 주세요.')
    if (ok) setApplied(text.trim())
    if (ok && title.trim() && text.trim()) {
      const r = await savePreset(picked === NEW ? null : picked, title, text).catch(() => 'invalid' as const)
      if (typeof r === 'object') { setPicked(r.id); setPresets(await listPresets().catch(() => presets)); message = t('이 대화에 적용하고 보관함에 저장했어요.') }
      else if (r === 'full') message = t('이 대화에 적용했어요. 보관함은 20개까지라 저장하지 못했어요.')
    }
    setBusy(false); setStatus(message)
  }
  const remove = async () => {
    if (!confirm) { setConfirm(true); return }
    await deletePreset(picked).catch(() => undefined)
    setPresets(presets.filter(p => p.id !== picked)); setConfirm(false); pick(NEW)
  }

  return (
    <div className={`create-page ${styles.noteForm}`}>
      {/* 11/21 사용자: 페르소나와 같은 모양 — 칸 위 굵은 이름표 + 분홍 안내, 채운 칸, 글자 수는 칸 밑 오른쪽. */}
      <div className={form.group}>
        <span className={form.label}>{t('내 노트 보관함')}<b aria-hidden>*</b></span>
        <SelectField name="preset" value={picked} onChange={pick}
          options={[{ value: NEW, label: t('새 노트') }, ...presets.map(p => ({ value: p.id, label: p.title }))]} />
      </div>

      <div className={form.group}>
        <label htmlFor="note-title" className={form.label}>{t('제목')}<b aria-hidden>*</b></label>
        <input id="note-title" className={form.input} value={title} maxLength={TITLE_MAX} placeholder={t('예: 경호원 설정')} autoComplete="off"
          onChange={(e) => { setTitle(e.target.value); setStatus(null) }} />
        <span className={form.count}>{title.length}/{TITLE_MAX}</span>
      </div>

      <div className={form.group}>
        <label htmlFor="note-text" className={form.label}>{t('내용')}<b aria-hidden>*</b></label>
        <textarea id="note-text" className={form.input} value={text} maxLength={MAX} rows={7} aria-label={t('유저노트')}
          placeholder={t('예: 나는 서른 살 디자이너, 반말로 불러 줘.\n우리는 3년째 사귀는 사이야.')}
          onChange={(e) => { setText(e.target.value); setStatus(null) }} />
        <span className={form.count} style={{ color: text.length >= MAX ? 'var(--color-danger)' : undefined }}>{text.length.toLocaleString()}/{MAX.toLocaleString()}</span>
      </div>

      <div className={styles.noteActions}>
        {picked !== NEW && <button type="button" className={styles.ghost} onClick={remove}>{confirm ? t('정말 지우기') : t('보관함에서 지우기')}</button>}
        <button type="button" className={styles.primary} disabled={busy || !changed} onClick={save}>{t('저장')}</button>
      </div>
      {status && <p className="t-caption" role="status" style={{ color: 'var(--color-text-secondary)' }}>{status}</p>}
    </div>
  )
}
