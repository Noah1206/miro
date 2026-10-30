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
/** 신음 FullFT v2(10/30) 가 배운 괄호 태그. 언베일 대사의 숨은 speech 칸에만 쓰고 화면엔 안 보인다. */
export const VOCAL_TAGS = ['[moaning softly]', '[moaning]', '[moaning loudly]', '[breathing heavily]'] as const
export const ADULT_SPEECH_PROMPT = `Adult scene voice: for each character dialogue block, also include a hidden "speech" string for the voice engine: the exact same text with vocal tags inserted where the moment physically calls for them. Allowed tags only: ${VOCAL_TAGS.join(' ')}. Read the scene: match the tag and its strength to what is happening right now (touch, arousal building, climax, catching breath afterwards) and to this character's personality — soft for held-back or teasing moments, loudly only at real peaks, breathing heavily for exertion or recovery. Tags may go at the start, between phrases, or at the end, and a line may carry several. Calm, emotional or non-physical lines get no tag; then omit speech. Never change, add or remove any other character of text, and never write tags inside text.`
/** 숨은 speech 가 태그만 더한 같은 대사일 때만 음성에 쓴다 — 아니면 null(화면 대사 그대로 읽음). */
export function taggedSpeech(text: string, speech: unknown): string | null {
  if (typeof speech !== 'string' || !speech.includes('[')) return null
  const bare = (s: string) => s.replace(/\s+/g, '')
  const stripped = VOCAL_TAGS.reduce((s, tag) => s.split(tag).join(''), speech)
  return !stripped.includes('[') && bare(stripped) === bare(text) ? speech.replace(/\s+/g, ' ').trim() : null
}
export const VOICE_DELIVERY_PROMPT =`For every character dialogue block, include a hidden delivery object matching its local context: {emotion:neutral|happy|sad|curious|hurt|jealous|angry|anxious,tone:normal|soft|whisper|firm|playful,pace:normal|slow|fast,intensity:normal|soft|strong,pauseAfterMs:integer0..1500}. Use restrained, character-consistent choices; normal/neutral and0ms are valid. Split dialogue at a meaningful change in delivery, within the existing block limit. Do not put delivery on narration/action/thought or write these directions inside text. text is exactly what the character says; no extra TTS call or separate analysis response.`
