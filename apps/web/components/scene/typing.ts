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
export function msPerChar(text: string, mood: Mood, pace = 1): number {
  const base = TYPING_MS_PER_CHAR[mood] * pace
  const max = MAX_PARAGRAPH_MS * pace
  // 바닥은 브라우저가 이어지는 타이머에 지키는 최소 간격(4ms) 위에 둔다.
  return text.length * base <= max ? base : Math.max(Math.max(4, 8 * pace), max / text.length)
}

/** 한 응답 전체를 치는 데 쓸 시간의 대략적 상한. */
export const MAX_REPLY_MS = 12000

/**
 * 응답 전체의 빠르기(1 = 기분 그대로). 캐릭터챗 답은 장면 하나라 문단이 5~8개다 (2026-09-26) —
 * 문단마다 상한까지 치면 30초가 넘게 흐른다. 문단이 많으면 글자 속도와 멈칫을 같은 비율로 줄인다.
 */
export function replyPace(paragraphs: number): number {
  return Math.min(1, MAX_REPLY_MS / (Math.max(1, paragraphs) * MAX_PARAGRAPH_MS))
}
