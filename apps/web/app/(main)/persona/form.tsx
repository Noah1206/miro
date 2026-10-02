'use client'
import { useActionState, useState } from 'react'
import { PERSONA_LIMITS, type UserPersona } from '@miro/domain'
import { SubmitButton } from '@/components/ui/submit-button'
import { ChoiceChips, CountedInput, CountedTextArea, LabeledField } from '@/app/(main)/create/form-parts'
import { savePersonaAction } from './actions'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

const GENDERS = [{ value: '', label: msg('밝히지 않음') }, { value: 'female', label: msg('여성') }, { value: 'male', label: msg('남성') }]

export function PersonaForm({ initial, next, submitLabel }: { initial: UserPersona | null; next: string; submitLabel: string }) {
  const [state, action] = useActionState(savePersonaAction, null)
  const [gender, setGender] = useState<string>(initial?.gender ?? '')
  const t = useT()
  return (
    <form action={action} className="stack" style={{ gap: 20 }}>
      <input type="hidden" name="next" value={next} />
      <LabeledField label={t('이름')} required hint={t('캐릭터가 대화에서 부를 이름이에요.')}>
        <CountedInput name="name" ariaLabel={t('이름')} placeholder={t('예) 지우')} max={PERSONA_LIMITS.name} defaultValue={initial?.name ?? ''} required />
      </LabeledField>
      <LabeledField label={t('성별')}>
        <ChoiceChips name="gender" value={gender} onChange={setGender} columns={3} options={GENDERS.map((g) => ({ ...g, label: t(g.label) }))} />
      </LabeledField>
      <LabeledField label={t('나에 대해')} hint={t('나이·외모·성격·직업처럼 캐릭터가 알았으면 하는 것을 적어 주세요. 비워 둬도 돼요.')}>
        <CountedTextArea name="description" ariaLabel={t('나에 대해')} max={PERSONA_LIMITS.description} rows={4} defaultValue={initial?.description ?? ''}
          placeholder={t('예) 스물여섯, 출판사 편집자. 낯을 가리지만 친해지면 장난이 많다.')} />
      </LabeledField>
      {state?.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      <SubmitButton full>{submitLabel}</SubmitButton>
    </form>
  )
}
