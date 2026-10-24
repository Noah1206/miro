import { createHash } from 'node:crypto'
import type { TtsRequest } from '@miro/providers'

export const MAX_SPEECH_BYTES = 4 * 1024 * 1024
export type SpeechSpec = { userId: string; sessionId: string; messageId: string; part: number; modelVersion: string; referenceVersion: string; payload: TtsRequest }
export type SpeechPolicy = { modelVersion: string; referenceVersion: string; maxJobMicroUsd: number; userDailyMicroUsd: number; globalDailyMicroUsd: number; userPending: number; globalPending: number; cacheBytes: number; timeoutMs: number }
export class SpeechError extends Error {
  constructor(public code: string, public status = 503) { super(code) }
}
export function speechPolicy(): SpeechPolicy {
  const version = (key: string) => { const v = process.env[key]; if (!v || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(v)) throw new SpeechError('speech_policy_missing'); return v }
  const integer = (key: string, min: number, max: number) => { const v = Number(process.env[key]); if (!Number.isSafeInteger(v) || v < min || v > max) throw new SpeechError('speech_policy_missing'); return v }
  return { modelVersion: version('MIRO_SPEECH_MODEL_VERSION'), referenceVersion: version('MIRO_SPEECH_REFERENCE_VERSION'),
    maxJobMicroUsd: integer('MIRO_SPEECH_MAX_JOB_MICRO_USD', 1, 1_000_000),
    userDailyMicroUsd: integer('MIRO_SPEECH_USER_DAILY_MICRO_USD', 1, 100_000_000),
    globalDailyMicroUsd: integer('MIRO_SPEECH_GLOBAL_DAILY_MICRO_USD', 1, 100_000_000),
    userPending: 2, globalPending: 8, cacheBytes: 64 * 1024 * 1024, timeoutMs: 180_000 }
}
export const speechQueueEnabled = () => process.env.MIRO_TTS_QUEUE_ENABLED === '1'
export const speechUserKey = (userId: string) => createHash('sha256').update(`miro:speech:user:${userId}`).digest('hex')
/** Include ownership and every synthesis input; no cross-user audio sharing. */
export function speechKey(spec: SpeechSpec): string {
  const p = spec.payload, d = p.delivery
  return createHash('sha256').update(JSON.stringify([spec.userId,spec.sessionId,spec.messageId,spec.part,spec.modelVersion,spec.referenceVersion,
    p.text,p.voice,p.language,p.style ?? 'normal',d ? [d.emotion,d.tone,d.pace,d.intensity,d.pauseAfterMs] : null])).digest('hex')
}
