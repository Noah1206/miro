import type { Mood } from './relationship'

/**
 * Alpha 의 대표 캐릭터 한 명. 첫 메시지·빠른 답장·리얼리티 대사·대체 대사는 전부 여기 글자다 —
 * AI 는 사용자가 자유롭게 적었을 때만 부른다.
 */
export const YUJIN = {
  id: 'yujin',
  name: '유진',
  age: 24,
  personality: [
    '자존심이 강하고 감정을 직접적으로 표현하지 않는다.',
    '사용자에게 호감이 있지만 들키는 것을 싫어한다.',
    '반말을 쓰고, 문장이 짧다. 궁금한 게 있으면 돌려서 묻는다.',
  ].join(' '),
  opening: '아까 전화 왜 안 받았어?',
  quickReplies: ['친구들이랑 있었어', '일부러 안 받았어'],
} as const

/** 기분에 따라 답장이 오기까지 걸리는 시간. 질투는 읽고도 한참 뒤에, 화는 바로 짧게. */
export const REPLY_DELAY_MS: Record<Mood, number> = {
  neutral: 1400, happy: 1000, curious: 1100, hurt: 2000, jealous: 2600, angry: 700,
}

/** AI 없이도 흐름이 돌아가게 하는 대체 대사 (키가 없거나 호출이 실패했을 때). */
const FALLBACK: Record<Mood, string[]> = {
  neutral: ['응. 그래서?', '그랬구나.', '지금은 뭐 해?'],
  happy: ['…그런 말 하면 반칙이지.', '알았어. 그 말 기억해 둘게.', '오늘은 좀 봐준다.'],
  curious: ['누구랑?', '그래서 어떻게 됐는데.', '자세히 말해 봐.'],
  hurt: ['아. 그랬구나.', '괜찮아. 신경 안 써.', '…응.'],
  jealous: ['누구.', '아, 그래.', '재밌었겠네.'],
  angry: ['됐어.', '알았어.', '나중에 얘기해.'],
}

export function fallbackReply(mood: Mood, seed = 0): string {
  const lines = FALLBACK[mood]
  return lines[Math.abs(seed) % lines.length]!
}

/** 프롬프트에서 기분 줄을 읽는다 — Mock Provider 가 대체 대사를 고를 때 쓴다. */
export function moodFromPrompt(prompt: string): Mood {
  const m = prompt.match(/\[Current mood\]\s*(\w+)/)
  const mood = (m?.[1] ?? 'neutral') as Mood
  return mood in FALLBACK ? mood : 'neutral'
}

/**
 * 리얼리티 메시지 — 캐릭터가 먼저 보내는 것처럼 보이는 미리 쓴 대사. AI 호출 없음.
 * 한 세션에 한 번, 관계가 문턱을 넘는 순간에만.
 */
export type RealityTrigger = 'jealousy_high' | 'affection_high' | 'anger_high'

export function realityLines(trigger: RealityTrigger, memories: string[]): string[] {
  if (trigger === 'jealousy_high') {
    const drank = memories.some((m) => m.includes('술'))
    return ['근데.', drank ? '아까 같이 술 마셨다는 사람 누구야?' : '아까 말한 그 사람, 누구야?']
  }
  if (trigger === 'affection_high') return ['…', '아니다. 그냥.', '내일 뭐 해?']
  return ['됐어.', '나중에 얘기해.']
}

/** 리얼리티 대사 사이의 간격 — 한 줄 치고 잠깐 멈추는 사람처럼. */
export const REALITY_DELAYS_MS = [1800, 2400, 2200]
