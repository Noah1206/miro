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
export const ADULT_SPEECH_PROMPT = `Adult scene voice: for each character dialogue block, also include a hidden "speech" string for the voice engine: the exact same text with vocal tags inserted where the moment physically calls for them. Allowed tags only: ${VOCAL_TAGS.join(' ')}. Read the scene: match the tag and its strength to what is happening right now (touch, arousal building, climax, catching breath afterwards) and to this character's personality. Do not hold back once the scene is physical: default to [moaning], use [moaning loudly] freely as arousal builds and at peaks, keep [moaning softly] for the first touches or deliberately restrained teasing, and [breathing heavily] for exertion or recovery. Put tags where the sound happens — mostly between phrases and at the start, not only at the end — and a line may carry several; let them grow denser as the scene escalates. When her mouth is busy (oral sex, deep kissing, being gagged), speech must also carry the muffled sounds themselves as Korean sound syllables between and inside the words: 우웁, 읍, 으읍, 츄릅, 쭙, 쪽, 컥, 하아 (e.g. "우웁… 읍… 더, 츄릅… 깊이… 우웁"). Gasps and panting may be written as 하아, 헉, 흐읏, 앗. Arousal speeds speech up: on a line with a moan tag, set that block's delivery pace to fast and intensity to strong and never tone whisper, unless the moment is deliberately slow and teasing. Calm, emotional or non-physical lines get no tag; then omit speech. In speech, only tags and those sound syllables may be added — never change or remove any word of text, and never write tags or sound syllables inside text.`
/** 11/11 음성에만 넣는 소리 글자(사용자: 오랄 때 "우웁 우웁" 빠는 소리) — 모델이 글자대로 소리 낸다. 이 글자·문장부호만 끼워 넣을 수 있다. */
const SOUND_CHARS = /[우웁읍으음츄릅쭙쯉쪽츕하아앗흐읏응흣핫헉컥켁…\.,!?~\-\s]/
/** 숨은 speech 가 태그·소리 글자만 더한 같은 대사일 때만 음성에 쓴다 — 아니면 null(화면 대사 그대로 읽음). */
export function taggedSpeech(text: string, speech: unknown): string | null {
  if (typeof speech !== 'string' || speech === text) return null
  const stripped = VOCAL_TAGS.reduce((s, tag) => s.split(tag).join(''), speech)
  if (stripped.includes('[')) return null
  // 대사 글자는 순서대로 다 있어야 하고, 그 사이에 더한 글자는 소리 글자뿐이어야 한다.
  const want = text.replace(/\s+/g, '')
  let i = 0
  for (const c of stripped.replace(/\s+/g, '')) {
    if (i < want.length && c === want[i]) i++
    else if (!SOUND_CHARS.test(c)) return null
  }
  return i === want.length ? speech.replace(/\s+/g, ' ').trim() : null
}
export const VOICE_DELIVERY_PROMPT =`For every character dialogue block, include a hidden delivery object matching its local context: {emotion:neutral|happy|sad|curious|hurt|jealous|angry|anxious,tone:normal|soft|whisper|firm|playful,pace:normal|slow|fast,intensity:normal|soft|strong,pauseAfterMs:integer0..1500}. The voice must carry what the body feels right now: when the user just did something sudden or physical (grabbing, touching, kissing, a shock), the first reaction line is startled — emotion anxious (or angry/hurt if it fits), pace fast, intensity strong, never neutral/normal — even if she tries to sound composed in words. Keep the same character's tone steady across a turn unless the moment changes it; otherwise character-consistent choices, normal/neutral and0ms are valid. Split dialogue at a meaningful change in delivery, within the existing block limit. Do not put delivery on narration/action/thought or write these directions inside text. text is exactly what the character says; no extra TTS call or separate analysis response.`
