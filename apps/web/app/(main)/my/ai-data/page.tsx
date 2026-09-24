import { eq } from 'drizzle-orm'
import { db, users, aiFeedback, aiEvaluationSamples } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
import { ConsentForm, type Consent } from './consent-form'
async function save(_: Consent, form: FormData): Promise<Consent> {
  'use server'
  const user = await requireUser()
  const allowTraining = form.get('training') === 'on', allowEvaluation = form.get('evaluation') === 'on'
  await db.transaction(async tx => {
    await tx.update(users).set({allowTraining,allowEvaluation,aiConsentVersion:'ai-data-v1',aiConsentAt:new Date()}).where(eq(users.id,user.id))
    if (!allowTraining) await tx.delete(aiFeedback).where(eq(aiFeedback.userId,user.id))
    if (!allowEvaluation) await tx.delete(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId,user.id))
  })
  return { allowTraining, allowEvaluation }
}
export default async function AIDataPage() {
  const user = await requireUser()
  const [u] = await db.select().from(users).where(eq(users.id,user.id))
  return <Page><PageHeader back="/my/settings" title="AI 개선 참여" lead="참여하지 않아도 같은 기능과 품질을 이용할 수 있어요." />
    <ConsentForm save={save} initial={{ allowTraining: !!u?.allowTraining, allowEvaluation: !!u?.allowEvaluation }} /></Page>
}
