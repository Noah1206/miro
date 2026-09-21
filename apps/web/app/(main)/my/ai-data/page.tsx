import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, users, aiFeedback, aiEvaluationSamples } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
async function save(form: FormData) {
  'use server'
  const user = await requireUser()
  const allowTraining = form.get('training') === 'on', allowEvaluation = form.get('evaluation') === 'on'
  await db.transaction(async tx => {
    await tx.update(users).set({allowTraining,allowEvaluation,aiConsentVersion:'ai-data-v1',aiConsentAt:new Date()}).where(eq(users.id,user.id))
    if (!allowTraining) await tx.delete(aiFeedback).where(eq(aiFeedback.userId,user.id))
    if (!allowEvaluation) await tx.delete(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId,user.id))
  })
  redirect('/my/ai-data')
}
export default async function AIDataPage() {
  const user = await requireUser()
  const [u] = await db.select().from(users).where(eq(users.id,user.id))
  return <Page><PageHeader back="/my/settings" title="AI 개선 참여" lead="참여하지 않아도 같은 기능과 품질을 이용할 수 있어요." />
    <form action={save} className="stack">
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}><input name="evaluation" type="checkbox" defaultChecked={u?.allowEvaluation} style={{ width: 18, height: 18 }} /> 대화 품질 평가에 참여하기</label>
      <p className="t-caption">일부 대화를 개인정보 가림 처리 후 품질 검토에 사용해요. 수집된 자료는 최대 30일 보관하고, 참여를 끄면 그동안 모인 자료를 삭제해요.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}><input name="training" type="checkbox" defaultChecked={u?.allowTraining} style={{ width: 18, height: 18 }} /> 모델 학습을 위한 데이터 제공에 동의하기</label>
      <p className="t-caption">동의한 대화와 피드백 중 개인정보·민감정보 검토와 품질 검사를 통과한 자료만 별도로 선정해요. 대화 원본을 자동으로 학습하지 않아요. 언제든 참여를 중단할 수 있고, 중단하면 제공된 피드백을 삭제해요.</p>
      <SubmitButton>저장하기</SubmitButton>
    </form></Page>
}
