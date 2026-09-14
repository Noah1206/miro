import type { Mood } from '@miro/domain'

/**
 * Alpha 의 대표 캐릭터. 정체성·성격·시작 관계는 DB 의 공식 캐릭터(slug 'yujin', 시드)에 있다 —
 * 여기는 화면이 쓰는 글자와 타이밍뿐이다.
 */
export const YUJIN = {
  slug: 'yujin',
  name: '유진',
  opening: '아까 전화 왜 안 받았어?',
  quickReplies: ['친구들이랑 있었어', '일부러 안 받았어'],
} as const

/** 기분에 따라 답장이 오기까지 걸리는 시간. 질투는 읽고도 한참 뒤에, 화는 바로 짧게. */
export const REPLY_DELAY_MS: Record<Mood, number> = {
  neutral: 1400, happy: 1000, curious: 1100, hurt: 2000, jealous: 2600, angry: 700, anxious: 1800,
}

/** 답장 뒤 캐릭터가 먼저 보내는 메시지까지의 간격 — 한 줄 치고 잠깐 멈추는 사람처럼. */
export const REALITY_DELAY_MS = 1800
