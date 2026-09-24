'use client'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'

export type Consent = { allowTraining: boolean; allowEvaluation: boolean }
const row = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' } as const
const box = { width: 18, height: 18 }

/**
 * The action returns what it saved, so the checkboxes stay correct after React resets the form. The page tree is
 * not re-sent: applying it kept the save button pending for 10s+ under E2E load while the POST took 21ms.
 */
export function ConsentForm({ save, initial }: { save: (state: Consent, form: FormData) => Promise<Consent>; initial: Consent }) {
  const [consent, action] = useActionState(save, initial)
  return <form action={action} className="stack">
    <label style={row}><input name="evaluation" type="checkbox" defaultChecked={consent.allowEvaluation} style={box} /> 대화 품질 평가에 참여하기</label>
    <p className="t-caption">일부 대화를 개인정보 가림 처리 후 품질 검토에 사용해요. 수집된 자료는 최대 30일 보관하고, 참여를 끄면 그동안 모인 자료를 삭제해요.</p>
    <label style={row}><input name="training" type="checkbox" defaultChecked={consent.allowTraining} style={box} /> 모델 학습을 위한 데이터 제공에 동의하기</label>
    <p className="t-caption">동의한 대화와 피드백 중 개인정보·민감정보 검토와 품질 검사를 통과한 자료만 별도로 선정해요. 대화 원본을 자동으로 학습하지 않아요. 언제든 참여를 중단할 수 있고, 중단하면 제공된 피드백을 삭제해요.</p>
    <SubmitButton>저장하기</SubmitButton>
  </form>
}
