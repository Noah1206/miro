'use server'
import { revalidatePath } from 'next/cache'
import { feature } from '@miro/config'
import { requireUser } from '@/lib/auth'
import { privacyVersion, termsVersion } from '@/lib/legal'
import { activateUserVoice, readVoicePrompt, createUserVoice, retireUserVoices, updateUserVoice, warmVoiceServer, type VoiceUploadError } from '@/lib/voice'

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
  const prompt = readVoicePrompt(user.id, String(form.get('promptToken') ?? ''))
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
