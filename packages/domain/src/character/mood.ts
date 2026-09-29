/** 기분 어휘. 관계 성격표(relationship/profile)도 이 목록을 읽어서, 상태(state.ts)와 따로 둔다 — 서로 부르면 순환이 된다. */
export const MOODS = ['neutral', 'happy', 'curious', 'hurt', 'jealous', 'angry', 'anxious'] as const
export type Mood = (typeof MOODS)[number]
