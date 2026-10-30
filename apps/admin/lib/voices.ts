import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { db, officialVoices, voiceJobs } from '@miro/db'

/** 목소리 만들기 작업 목록(최근 50) — /voices 화면. 워커가 stage·log 를 채운다. */
export async function listVoiceJobs() {
  return db.select().from(voiceJobs).orderBy(desc(voiceJobs.createdAt)).limit(50)
}

/** 목소리 라이브러리(공식 + 회원) — 미리 듣기 버튼의 대상. provider_voice_id 가 음성 서버의 목소리 이름이다. */
export async function listVoices() {
  return db.select({ id: officialVoices.id, label: officialVoices.label, status: officialVoices.status, providerVoiceId: officialVoices.providerVoiceId, rights: officialVoices.rights, ownerId: officialVoices.ownerId, shared: officialVoices.shared })
    .from(officialVoices).orderBy(asc(officialVoices.activatedAt))
}

export async function createVoiceJob(input: { voiceId: string; label: string; sourceUrls: string[]; rights: { basis: string; holder: string; evidence: string }; requestedBy: string }) {
  const [row] = await db.insert(voiceJobs).values(input).returning({ id: voiceJobs.id })
  if (!row) throw new Error('voice job insert returned nothing')
  return row.id
}

/**
 * 회원 목소리 내리기(신고·권리 침해, 10/31). 바로 retired 로 바꿔 어느 캐릭터도 이 목소리로 읽지 않게 하고,
 * 녹음 파일은 웹 정리 크론(purgeAbandonedVoices)이 Modal 에서 지운다 — 관리자 콘솔은 Modal 키를 갖지 않는다.
 */
export async function retireMemberVoice(id: string) {
  await db.update(officialVoices).set({ status: 'retired', retiredAt: sql`now()`, shared: false })
    .where(and(eq(officialVoices.id, id), isNotNull(officialVoices.ownerId), ne(officialVoices.status, 'retired')))
}
