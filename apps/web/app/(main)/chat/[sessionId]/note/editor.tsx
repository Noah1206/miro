'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { LabeledField, box, fieldFont, fieldPad } from '../../../create/form-parts'
import { SelectField } from '../../../create/settings-controls'
import { deletePreset, listPresets, savePreset, saveRoomNote, type NotePreset } from './actions'
import styles from '../memory/memory.module.css'

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
  const [focus, setFocus] = useState<'title' | 'text' | null>(null)
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
      <LabeledField label={t('내 노트 보관함')} hint={t('저장해 둔 노트를 고르면 아래에 채워져요. 대화마다 하나만 적용돼요.')}>
        <SelectField name="preset" value={picked} onChange={pick}
          options={[{ value: NEW, label: t('새 노트') }, ...presets.map(p => ({ value: p.id, label: p.title }))]} />
      </LabeledField>

      <LabeledField label={t('제목')} hint={t('제목을 적으면 보관함에도 저장돼요.')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: fieldPad, ...box(focus === 'title') }}>
          <input value={title} maxLength={TITLE_MAX} aria-label={t('제목')} placeholder={t('예: 경호원 설정')} autoComplete="off"
            onFocus={() => setFocus('title')} onBlur={() => setFocus(null)} onChange={(e) => { setTitle(e.target.value); setStatus(null) }}
            style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont }} />
        </div>
      </LabeledField>

      <LabeledField label={t('내용')} hint={t('매 답변 바로 앞에 실려서, 대화가 길어져도 잊지 않아요.')}>
        <div style={{ padding: fieldPad, paddingBottom: 'var(--field-pad-b, 3px)', ...box(focus === 'text') }}>
          <textarea value={text} maxLength={MAX} rows={5} aria-label={t('유저노트')}
            placeholder={t('예: 나는 서른 살 디자이너, 반말로 불러 줘.\n우리는 3년째 사귀는 사이야.')}
            onFocus={() => setFocus('text')} onBlur={() => setFocus(null)} onChange={(e) => { setText(e.target.value); setStatus(null) }}
            style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont, lineHeight: 1.5, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: text.length >= MAX ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{text.length.toLocaleString()}/{MAX.toLocaleString()}</span>
          </div>
        </div>
      </LabeledField>

      <div className={styles.noteActions}>
        {picked !== NEW && <button type="button" className={styles.ghost} onClick={remove}>{confirm ? t('정말 지우기') : t('보관함에서 지우기')}</button>}
        <button type="button" className={styles.primary} disabled={busy || !changed} onClick={save}>{t('저장')}</button>
      </div>
      {status && <p className="t-caption" role="status" style={{ color: 'var(--color-text-secondary)' }}>{status}</p>}
    </div>
  )
}
