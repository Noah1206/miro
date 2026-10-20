import { asc, desc } from 'drizzle-orm'
import { db, officialVoices, voiceJobs } from '@miro/db'

/** 목소리 만들기 작업 목록(최근 50) — /voices 화면. 워커가 stage·log 를 채운다. */
export async function listVoiceJobs() {
  return db.select().from(voiceJobs).orderBy(desc(voiceJobs.createdAt)).limit(50)
}

/** 공식 목소리 라이브러리 — 미리 듣기 버튼의 대상. provider_voice_id 가 음성 서버의 목소리 이름이다. */
export async function listVoices() {
  return db.select({ id: officialVoices.id, label: officialVoices.label, status: officialVoices.status, providerVoiceId: officialVoices.providerVoiceId, rights: officialVoices.rights })
    .from(officialVoices).orderBy(asc(officialVoices.activatedAt))
}

export async function createVoiceJob(input: { voiceId: string; label: string; sourceUrls: string[]; rights: { basis: string; holder: string; evidence: string }; requestedBy: string }) {
  const [row] = await db.insert(voiceJobs).values(input).returning({ id: voiceJobs.id })
  if (!row) throw new Error('voice job insert returned nothing')
  return row.id
}
