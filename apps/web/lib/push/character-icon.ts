import { isUnveilPhoto } from '@/lib/unveil-photo'

/** 11/10 알림 아이콘 — 캐릭터 대표 사진(언베일 사진은 건너뛴다). 없으면 undefined(앱 아이콘). */
export const characterPushIcon = (images: string[] | null | undefined): string | undefined =>
  (images ?? []).find(src => !isUnveilPhoto(src))
