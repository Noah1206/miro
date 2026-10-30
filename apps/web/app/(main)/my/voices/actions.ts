'use server'
import { randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { feature } from '@miro/config'
import { requireUser } from '@/lib/auth'
import { privacyVersion, termsVersion } from '@/lib/legal'
import { VOICE_PROMPTS, activateUserVoice, createUserVoice, retireUserVoices, updateUserVoice, warmVoiceServer, type VoiceUploadError } from '@/lib/voice'

const PROMPT = 'miro_voice_prompt'

/** 읽을 문장을 서버가 고르고 10분짜리 httpOnly 쿠키에 적는다 — 올릴 때 이 문장으로 받아쓰기 대조를 한다. */
export async function beginVoicePrompt(): Promise<string> {
  await requireUser()
  const i = randomInt(VOICE_PROMPTS.length)
  ;(await cookies()).set(PROMPT, String(i), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 })
  return VOICE_PROMPTS[i]!
}

/** 녹음 시작 때 GPU 깨우기(기다리지 않음). */
export async function warmVoice() {
  await requireUser()
  if (feature('characterVoice')) await warmVoiceServer()
}

/** 녹음 올리기 — 동의 두 개(본인 목소리·복제와 서비스 사용)는 필수, 공개·언베일 사용은 선택. */
export async function createVoice(form: FormData): Promise<{ id: string } | { error: VoiceUploadError }> {
  const user = await requireUser()
  if (!feature('characterVoice')) return { error: 'unavailable' }
  const audio = form.get('audio')
  if (!(audio instanceof File)) return { error: 'invalid' }
  const prompt = Number((await cookies()).get(PROMPT)?.value ?? -1)
  const out = await createUserVoice({ userId: user.id, label: String(form.get('label') ?? ''), audio: new Uint8Array(await audio.arrayBuffer()),
    prompt, ownVoice: form.get('ownVoice') === 'on', cloneConsent: form.get('cloneConsent') === 'on',
    shared: form.get('shared') === 'on', adult: form.get('adult') === 'on', termsVersion: termsVersion(), privacyVersion: privacyVersion() })
  revalidatePath('/my/voices')
  return out
}

export async function activateVoice(id: string) {
  const user = await requireUser()
  await activateUserVoice(user.id, id)
  revalidatePath('/my/voices')
}

export async function setVoiceOption(id: string, patch: { shared?: boolean; adultAllowed?: boolean }) {
  const user = await requireUser()
  await updateUserVoice(user.id, id, { ...(typeof patch.shared === 'boolean' ? { shared: patch.shared } : {}), ...(typeof patch.adultAllowed === 'boolean' ? { adultAllowed: patch.adultAllowed } : {}) })
  revalidatePath('/my/voices')
}

export async function deleteVoice(id: string) {
  const user = await requireUser()
  await retireUserVoices(user.id, [id])
  revalidatePath('/my/voices')
}
