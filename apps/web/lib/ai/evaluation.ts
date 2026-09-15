import { eq } from 'drizzle-orm'
import { db, users, aiEvaluationSamples } from '@miro/db'
import { cohort, redactData, sensitiveData } from '@miro/providers'
export async function captureEvaluation(userId: string, requestId: string, data: { input: string; response: string; context: string; promptVersion: string; modelId: string | null; shadow?: unknown }) {
  const rate = Number(process.env.MIRO_EVAL_SAMPLE_PERCENT ?? 0)
  if (!Number.isFinite(rate) || rate <= 0 || cohort(requestId) >= Math.min(100,rate)) return
  await db.transaction(async tx => {
    const [u] = await tx.select().from(users).where(eq(users.id,userId)).for('update')
    if (!u?.allowEvaluation || !u.aiConsentVersion || u.deletedAt) return
    const raw = JSON.stringify(data)
    if (sensitiveData(raw)) return
    const cleaned = JSON.parse(redactData(raw,[u.email ?? '',u.displayName ?? '']))
    await tx.insert(aiEvaluationSamples).values({userId,requestId,consentVersion:u.aiConsentVersion,content:cleaned}).onConflictDoNothing()
  })
}
