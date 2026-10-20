'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createVoiceJob } from '@/lib/voices'

export type JobState = { message: string | null; ok: boolean }
const BASES = ['own_voice', 'written_consent', 'license', 'unverified'] as const

/** 유튜브 링크로 목소리 만들기 작업을 건다. 권한은 characters.manage(superadmin). 실제 일은 맥북 워커가 한다. */
export async function createJob(_p: JobState, form: FormData): Promise<JobState> {
  let admin
  try { admin = await requireAdmin('characters.manage') } catch { return { ok: false, message: '목소리 등록 권한이 없습니다.' } }
  const urls = String(form.get('urls') ?? '').split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u)).slice(0, 3)
  if (!urls.length) return { ok: false, message: '유튜브 주소를 1~3개 넣어 주세요.' }
  const voiceId = String(form.get('voiceId') ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(voiceId)) return { ok: false, message: '목소리 ID 는 소문자·숫자·하이픈 2~40자(예: template-5).' }
  const label = String(form.get('label') ?? '').trim()
  if (!label || label.length > 30) return { ok: false, message: '화면에 보일 이름은 1~30자.' }
  const basis = String(form.get('basis') ?? 'unverified')
  if (!(BASES as readonly string[]).includes(basis)) return { ok: false, message: '권리 근거 값이 잘못됐습니다.' }
  try {
    await createVoiceJob({ voiceId, label, sourceUrls: urls, requestedBy: admin.email,
      rights: { basis, holder: String(form.get('holder') ?? '').trim().slice(0, 200), evidence: String(form.get('evidence') ?? '').trim().slice(0, 500) } })
  } catch (e) {
    return { ok: false, message: /unique|duplicate/i.test(String(e)) ? '같은 ID 의 작업이 이미 있습니다.' : '작업을 만들지 못했습니다.' }
  }
  revalidatePath('/voices')
  return { ok: true, message: `작업을 걸었습니다. 맥북 워커가 집어 가면 상태가 바뀝니다(다운로드·전사 10분, CPU 학습 1~2시간).` }
}
