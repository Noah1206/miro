import type { Mood } from '@miro/domain'

/**
 * 타이핑 속도 — 글자당 밀리초. 캐릭터의 기분이 손끝에 나온다.
 *
 * 답장 지연(REPLY_DELAY_MS)이 "언제 답하는가" 라면 이것은 "어떻게 치는가" 다.
 * 상한다(hurt)·질투한다(jealous)면 느리게 치고, 화났다면 쏘아붙이듯 빠르다.
 */
export const TYPING_MS_PER_CHAR: Record<Mood, number> = {
  neutral: 32, happy: 24, curious: 28, hurt: 52, jealous: 46, angry: 18, anxious: 40,
}

/** 한 문단을 다 치는 데 걸릴 시간. 너무 긴 대사가 하염없이 흐르지 않게 상한을 둔다. */
export const MAX_PARAGRAPH_MS = 4000

/**
 * 멈칫 — 문장이 끝나는 자리에서 잠깐 쉰다. 사람이 치는 것처럼 보이게 하는 것의 절반은 이 틈이다.
 * 말줄임표 뒤가 가장 길다: 망설임은 대사가 아니라 침묵으로 드러난다.
 */
export function pauseAfter(char: string, next: string, mood: Mood): number {
  const scale = TYPING_MS_PER_CHAR[mood] / TYPING_MS_PER_CHAR.neutral
  if (char === '…' && next !== '…') return 420 * scale
  if (char === '?' || char === '!') return 300 * scale
  if (char === '.' && next !== '.') return 260 * scale
  if (char === ',') return 120 * scale
  if (char === '\n') return 220 * scale
  return 0
}

/**
 * 이 문단을 치는 데 쓸 글자당 시간. 긴 대사는 상한 안에 들도록 자동으로 빨라진다 —
 * 200자짜리 서술을 기분대로 치면 10초가 넘는다.
 */
export function msPerChar(text: string, mood: Mood): number {
  const base = TYPING_MS_PER_CHAR[mood]
  const estimated = text.length * base
  return estimated <= MAX_PARAGRAPH_MS ? base : Math.max(8, MAX_PARAGRAPH_MS / text.length)
}
