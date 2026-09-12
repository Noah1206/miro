'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { submitReport } from '@/lib/ops/reports'
import { track } from '@/lib/analytics/track'

const Form = z.object({
  type: z.enum(['message', 'photo', 'live_scene']), id: z.string().uuid(),
  reason: z.enum(['safety', 'rights', 'harassment', 'inappropriate', 'other']), detail: z.string().max(1000),
})
export type ReportState = { error: string | null }

/** n32 — 신고 제출. 중복은 안내하고, 성공 시 접수 완료(n33)로. */
export async function submit(_p: ReportState, form: FormData): Promise<ReportState> {
  const user = await requireUser()
  const parsed = Form.safeParse({ type: form.get('type'), id: form.get('id'), reason: form.get('reason'), detail: String(form.get('detail') ?? '').trim() })
  if (!parsed.success) return { error: '신고 사유를 선택해 주세요.' }
  const r = await submitReport(user.id, { type: parsed.data.type, id: parsed.data.id }, parsed.data.reason, parsed.data.detail)
  if (!r.ok) return { error: r.reason === 'duplicate' ? '이미 접수된 신고입니다. 검토 결과를 기다려 주세요.' : '신고 대상을 찾을 수 없습니다.' }
  void track(user.id, 'report_submitted', { targetType: parsed.data.type, reason: parsed.data.reason })
  redirect(`/report/done?id=${r.id}`)
}
