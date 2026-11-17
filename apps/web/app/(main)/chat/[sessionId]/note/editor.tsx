'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { deletePreset, listPresets, savePreset, saveRoomNote, type NotePreset } from './actions'
import styles from '../memory/memory.module.css'

const MAX = 2000

/**
 * 11/17 유저노트 편집기(베이비챗식) — 위: 이 대화에 적용 중인 노트, 아래: 내 노트 보관함(여러 개 저장 → 하나를 골라 이 대화에 적용).
 */
export function NoteEditor({ sessionId, initial, initialPresets }: { sessionId: string; initial: string; initialPresets: NotePreset[] }) {
  const t = useT()
  const [saved, setSaved] = useState(initial)
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [presets, setPresets] = useState<NotePreset[]>(initialPresets)
  const [naming, setNaming] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const changed = text.trim() !== saved.trim()
  const refresh = () => listPresets().then(setPresets).catch(() => setPresets([]))

  const save = async (value = text) => {
    setBusy(true); setStatus(null)
    const ok = await saveRoomNote(sessionId, value).catch(() => false)
    setBusy(false)
    if (ok) { setSaved(value.trim()); setText(value.trim()); setStatus(t('이 대화에 적용했어요.')) } else setStatus(t('저장하지 못했어요. 다시 시도해 주세요.'))
  }
  const keep = async () => {
    const r = await savePreset(title, text).catch(() => 'invalid' as const)
    if (r === 'ok') { setNaming(false); setTitle(''); setStatus(t('보관함에 저장했어요.')); void refresh() }
    else setStatus(r === 'full' ? t('보관함은 20개까지예요. 안 쓰는 노트를 지워 주세요.') : t('제목과 내용을 적어 주세요.'))
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <section className={styles.noteCard}>
        <div className={styles.noteHead}>
          <h2 className="t-title-3">{t('이 대화에 적용 중')}</h2>
          <span className="t-micro" style={{ color: text.length > MAX * 0.9 ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}>{text.length.toLocaleString()} / {MAX.toLocaleString()}</span>
        </div>
        <textarea className={styles.noteField} value={text} maxLength={MAX} rows={12} aria-label={t('유저노트')}
          placeholder={t('캐릭터가 이 대화에서 꼭 지켜 줬으면 하는 설정을 적어 주세요.\n예: 나는 서른 살 디자이너, 반말로 불러 줘 / 우리는 3년째 사귀는 사이')}
          onChange={(e) => { setText(e.target.value); setStatus(null) }} />
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('매 답변 바로 앞에 실려서, 대화가 길어져도 잊지 않아요.')}</p>
        <div className={styles.noteActions}>
          {text.trim() && <button type="button" className={styles.ghost} onClick={() => { setNaming(true); setStatus(null) }}>{t('보관함에 저장')}</button>}
          <button type="button" className={styles.primary} disabled={busy || !changed} onClick={() => save()}>{t('저장')}</button>
        </div>
        {naming && <div className={styles.noteActions} style={{ justifyContent: 'stretch' }}>
          <input className={styles.noteField} style={{ flex: 1 }} value={title} maxLength={40} autoFocus aria-label={t('노트 제목')} placeholder={t('노트 제목')} onChange={(e) => setTitle(e.target.value)} />
          <button type="button" className={styles.primary} onClick={keep}>{t('저장')}</button>
          <button type="button" className={styles.ghost} onClick={() => setNaming(false)}>{t('취소')}</button>
        </div>}
        {status && <p className="t-caption" role="status" style={{ color: 'var(--color-text-secondary)' }}>{status}</p>}
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div className={styles.noteHead}>
          <h2 className="t-title-3">{t('내 노트 보관함')}</h2>
          <span className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>{presets.length} / 20</span>
        </div>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('자주 쓰는 노트를 저장해 두고, 대화마다 하나를 골라 적용하세요.')}</p>
        {presets.length === 0 && <p className={`t-caption ${styles.emptyBox}`}>{t('아직 저장한 노트가 없어요.')}</p>}
        {presets.map(p => (
          <article key={p.id} className={styles.preset}>
            <strong className="t-body">{p.title}</strong>
            <p className="t-caption">{p.content}</p>
            <div className={styles.noteActions}>
              <button type="button" className={styles.ghost} onClick={async () => { if (confirmId !== p.id) { setConfirmId(p.id); return } setConfirmId(null); await deletePreset(p.id).catch(() => undefined); void refresh() }}>
                {confirmId === p.id ? t('정말 지우기') : t('지우기')}</button>
              <button type="button" className={styles.primary} disabled={busy || saved.trim() === p.content.trim()} onClick={() => save(p.content)}>
                {saved.trim() === p.content.trim() ? t('적용 중') : t('이 대화에 적용')}</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
