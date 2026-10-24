/** Shared wire contract: generated with dialogue, never displayed or spoken as text. */
export const VOICE_EMOTIONS = ['neutral', 'happy', 'sad', 'curious', 'hurt', 'jealous', 'angry', 'anxious'] as const
export const VOICE_TONES = ['normal', 'soft', 'whisper', 'firm', 'playful'] as const
export const VOICE_PACES = ['normal', 'slow', 'fast'] as const
export const VOICE_INTENSITIES = ['normal', 'soft', 'strong'] as const
export type VoiceDelivery = {
  emotion: typeof VOICE_EMOTIONS[number]
  tone: typeof VOICE_TONES[number]
  pace: typeof VOICE_PACES[number]
  intensity: typeof VOICE_INTENSITIES[number]
  pauseAfterMs: number
}
export function voiceDelivery(value: unknown, whisper = false): VoiceDelivery {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const pick = <T extends string>(values: readonly T[], candidate: unknown, fallback: T): T =>
    values.includes(candidate as T) ? candidate as T : fallback
  return {
    emotion: pick(VOICE_EMOTIONS, v.emotion, 'neutral'),
    tone: pick(VOICE_TONES, v.tone, whisper ? 'whisper' : 'normal'),
    pace: pick(VOICE_PACES, v.pace, 'normal'),
    intensity: pick(VOICE_INTENSITIES, v.intensity, 'normal'),
    pauseAfterMs: typeof v.pauseAfterMs === 'number' && Number.isFinite(v.pauseAfterMs)
      ? Math.round(Math.max(0, Math.min(1500, v.pauseAfterMs))) : 0,
  }
}
export const VOICE_DELIVERY_PROMPT = `For every character dialogue block, include a hidden delivery object matching its local context: {emotion:neutral|happy|sad|curious|hurt|jealous|angry|anxious,tone:normal|soft|whisper|firm|playful,pace:normal|slow|fast,intensity:normal|soft|strong,pauseAfterMs:integer0..1500}. Use restrained, character-consistent choices; normal/neutral and0ms are valid. Split dialogue at a meaningful change in delivery, within the existing block limit. Do not put delivery on narration/action/thought or write these directions inside text. text is exactly what the character says; no extra TTS call or separate analysis response.`
