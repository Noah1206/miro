import { and, asc, eq } from 'drizzle-orm'
import { db, officialVoices } from '@miro/db'

/**
 * 만들기·편집 화면이 고를 수 있는 공식 목소리. 엔진 쪽 목소리 ID 는 싣지 않는다 — 화면에는 이름만 간다.
 * 몰입 모드(10/19)가 이 목소리로 답을 읽는다(전화 플래그와 무관). 등록된 목소리가 없으면 비어서 '목소리' 칸이 보이지 않는다.
 */
export async function voiceOptions(): Promise<Array<{ id: string; label: string }>> {
  return db.select({ id: officialVoices.id, label: officialVoices.label }).from(officialVoices)
    .where(eq(officialVoices.status, 'active')).orderBy(asc(officialVoices.activatedAt))
}

/** 폼이 보낸 목소리가 지금 고를 수 있는 공식 목소리면 그 ID, 아니면 null(기본 목소리). 저장할 때마다 서버가 다시 본다. */
export async function selectableVoice(id: string | null): Promise<string | null> {
  if (!id) return null
  const [row] = await db.select({ id: officialVoices.id }).from(officialVoices)
    .where(and(eq(officialVoices.id, id), eq(officialVoices.status, 'active'))).limit(1)
  return row?.id ?? null
}
