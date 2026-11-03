'use client'
import { useActionState, useState, useEffect } from 'react'
import { PERSONA_LIMITS, type UserPersona } from '@miro/domain'
import { SubmitButton } from '@/components/ui/submit-button'
import { savePersonaAction, saveConversationPersonaAction } from './actions'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import styles from './form.module.css'

const GENDERS = [{ value: '', label: msg('밝히지 않음') }, { value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }]

export function PersonaForm({ initial, next, submitLabel, sessionId, onDone }: { initial: UserPersona | null; next: string; submitLabel: string; sessionId?: string; onDone?: () => void }) {
  const [state, action] = useActionState(sessionId ? saveConversationPersonaAction : savePersonaAction, null)
  const [gender, setGender] = useState<string>(initial?.gender ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [about, setAbout] = useState(initial?.description ?? '')
  const t = useT()
  useEffect(() => { if (state?.saved) onDone?.() }, [state, onDone])
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      <label className={styles.field}>
        <span className={styles.top}><span>{t('이름')}<b aria-hidden>*</b></span><span>{name.length}/{PERSONA_LIMITS.name}</span></span>
        <input name="name" value={name} onChange={e => setName(e.target.value)} maxLength={PERSONA_LIMITS.name} required autoComplete="off" placeholder={t('예) 지우')} />
      </label>
      <div className={styles.genders} role="group" aria-label={t('성별')}>
        <span className={styles.top}>{t('성별')}</span>
        <input type="hidden" name="gender" value={gender} />
        <div className={styles.seg}>
          {GENDERS.map(g => <button key={g.value} type="button" aria-pressed={gender === g.value} onClick={() => setGender(g.value)}>{t(g.label)}</button>)}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.top}><span>{t('나에 대해')}</span><span>{about.length}/{PERSONA_LIMITS.description}</span></span>
        <textarea name="description" value={about} onChange={e => setAbout(e.target.value)} maxLength={PERSONA_LIMITS.description} rows={4}
          placeholder={t('예) 스물여섯, 출판사 편집자. 낯을 가리지만 친해지면 장난이 많다.')} />
      </label>
      {state?.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      <div className={styles.submit}><SubmitButton full variant="primary" size="lg">{submitLabel}</SubmitButton></div>
    </form>
  )
}
