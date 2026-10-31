import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { db, officialVoices } from '@miro/db'

/**
 * 목소리 — 공식(ownerId null) + 회원이 직접 읽은 녹음(10/31). 엔진 쪽 목소리 ID 는 싣지 않는다 — 화면에는 이름만 간다.
 * 몰입 모드(10/19)가 이 목소리로 답을 읽는다(전화 플래그와 무관). 고를 목소리가 없으면 비어서 '목소리' 칸이 보이지 않는다.
 * 회원 녹음은 Drama 3 참조 목소리라 학습이 없다: 녹음(이때 GPU 를 깨움) → Modal Voices(품질·받아쓰기 대조, tooling/voice/modal_drama3_serve.py)
 * → 저장하자마자 GPU 가 미리 듣기를 만듦 → 화면이 받아 재생 → 등록.
 */

/** 이 회원이 캐릭터에 고를 수 있는 목소리 — 공식, 내 것, 다른 회원이 공개한 것(등록 끝난 것만). */
const selectable = (userId: string) => and(eq(officialVoices.status, 'active'),
  or(isNull(officialVoices.ownerId), eq(officialVoices.ownerId, userId), eq(officialVoices.shared, true)))

export async function voiceOptions(userId: string): Promise<Array<{ id: string; label: string; mine: boolean }>> {
  const rows = await db.select({ id: officialVoices.id, label: officialVoices.label, ownerId: officialVoices.ownerId }).from(officialVoices)
    .where(selectable(userId)).orderBy(asc(officialVoices.activatedAt))
  return rows.map((r) => ({ id: r.id, label: r.label, mine: r.ownerId === userId }))
}

/** 폼이 보낸 목소리가 지금 이 회원이 고를 수 있는 것이면 그 ID, 아니면 null(기본 목소리). 저장할 때마다 서버가 다시 본다. */
export async function selectableVoice(id: string | null, userId: string): Promise<string | null> {
  if (!id) return null
  const [row] = await db.select({ id: officialVoices.id }).from(officialVoices)
    .where(and(eq(officialVoices.id, id), selectable(userId))).limit(1)
  return row?.id ?? null
}

/**
 * 읽을 때 다시 보는 규칙 — 고른 뒤에 만든 사람이 공개를 끄거나 언베일 사용을 끄면 그때부터 그 캐릭터는 이 목소리로 읽지 않는다.
 * characterOwnerId = 목소리를 고른 캐릭터 제작자(듣는 사람이 아니다).
 */
export function voiceUsable(v: { voiceStatus: string | null; voiceOwnerId: string | null; voiceShared: boolean | null; voiceAdultAllowed: boolean | null },
  characterOwnerId: string | null, adult: boolean): boolean {
  if (v.voiceStatus !== 'active') return false
  if (v.voiceOwnerId && v.voiceOwnerId !== characterOwnerId && !v.voiceShared) return false
  return !adult || !!v.voiceAdultAllowed
}
export const voiceColumns = { voiceStatus: officialVoices.status, voiceOwnerId: officialVoices.ownerId, voiceShared: officialVoices.shared, voiceAdultAllowed: officialVoices.adultAllowed }

/**
 * 녹음할 때 화면에 띄우는 문장. 서버가 골라 쿠키에 적고(브라우저가 고르지 못한다), Modal 이 받아쓰기로 그 문장을 읽었는지 대조한다.
 * 미리 만든 남의 녹음 파일로는 통과하기 어렵다(ElevenLabs·Resemble 의 문장 읽기 확인과 같은 방식). 읽은 문장이 그대로 참조 글(ref.txt)이 된다. 한국어만(10/31 결정).
 * ponytail: AI 로 만든 남의 목소리로 문장을 읽히면 통과한다 — 가짜 음성 탐지(AASIST 등)는 최신 합성에 오류율이 높아 넣지 않고 신고·내리기로 막는다.
 */
export const VOICE_PROMPTS = [
  '오늘은 하늘이 맑아서 오랜만에 창문을 열고 천천히 커피를 마셨어요. 바람이 생각보다 따뜻하더라고요.',
  '어제 본 영화가 계속 생각나요. 마지막 장면에서 주인공이 웃는데, 이상하게 마음이 찡했어요.',
  '퇴근길에 작은 빵집을 발견했어요. 갓 구운 냄새가 너무 좋아서 결국 두 개나 사 버렸지 뭐예요.',
  '주말에는 아무 계획 없이 걷고 싶어요. 좋아하는 노래를 들으면서 모르는 골목을 지나가 보는 거죠.',
  '비 오는 날에는 괜히 옛날 생각이 나요. 그때 같이 웃던 친구들은 지금 다들 잘 지내고 있을까요.',
  '처음 혼자 여행을 갔을 때가 떠올라요. 길을 잃었는데도 이상하게 하나도 무섭지 않았어요.',
  '요즘은 밤에 산책하는 게 제일 좋아요. 조용한 길을 걷다 보면 하루 동안 쌓인 생각이 정리되거든요.',
  '고양이가 창가에 앉아서 햇볕을 쬐고 있었어요. 너무 평화로워 보여서 한참을 그냥 바라봤어요.',
]
/**
 * 읽을 문장 표 — 페이지가 문장을 고르며 서명한 1시간짜리 값. 브라우저는 문장을 바꿀 수 없고, 페이지가 바로 문장을 그린다
 * (10/31 운영 확인: 쿠키를 서버 액션으로 받느라 문장이 몇 초 늦게 떴다).
 */
const sign = (body: string) => createHmac('sha256', process.env.MIRO_TTS_API_KEY ?? 'dev').update(`voice-prompt:${body}`).digest('base64url')
export function issueVoicePrompt(userId: string, now = Date.now()): { text: string; token: string } {
  const i = randomInt(VOICE_PROMPTS.length), body = `${userId}.${i}.${now + 3_600_000}`
  return { text: VOICE_PROMPTS[i]!, token: `${body}.${sign(body)}` }
}
export function readVoicePrompt(userId: string, token: string, now = Date.now()): number {
  const [u, i, exp, mac] = token.split('.'), body = `${u}.${i}.${exp}`
  const want = Buffer.from(sign(body)), got = Buffer.from(mac ?? '')
  if (u !== userId || Number(exp) < now || want.length !== got.length || !timingSafeEqual(want, got)) return -1
  return Number(i)
}

/** 회원당 목소리 수 상한. 미리 듣기는 올릴 때 한 번만 GPU 로 만들고, 다시 들을 때는 저장된 파일이라 GPU 를 쓰지 않는다. */
export const MAX_USER_VOICES = 5

export type MyVoice = { id: string; label: string; status: 'pending' | 'active'; shared: boolean; adultAllowed: boolean }
export async function myVoices(userId: string): Promise<MyVoice[]> {
  const rows = await db.select({ id: officialVoices.id, label: officialVoices.label, status: officialVoices.status, shared: officialVoices.shared, adultAllowed: officialVoices.adultAllowed })
    .from(officialVoices).where(and(eq(officialVoices.ownerId, userId), ne(officialVoices.status, 'retired'))).orderBy(asc(officialVoices.activatedAt))
  return rows as MyVoice[]
}

function uploadBase() {
  const url = process.env.MIRO_VOICE_UPLOAD_URL?.replace(/\/$/, ''), key = process.env.MIRO_TTS_API_KEY
  if (!url || !key) throw new Error('voice_upload_unavailable')
  return { url, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` } }
}

export type VoiceUploadError = 'invalid' | 'unreadable' | 'length' | 'quiet' | 'clipped' | 'mismatch' | 'limit' | 'unavailable'
/**
 * 녹음을 올리고 pending 으로 적는다. 동의 기록(rights)에 무엇에 언제 동의했는지 남긴다.
 * 본인 목소리 확인·복제와 서비스 사용 동의는 필수라 화면에서 체크해야 여기까지 온다(서버도 다시 본다).
 */
export async function createUserVoice(input: { userId: string; label: string; audio: Uint8Array; prompt: number; shared: boolean; adult: boolean; ownVoice: boolean; cloneConsent: boolean; termsVersion: string; privacyVersion: string }): Promise<{ id: string } | { error: VoiceUploadError }> {
  const text = VOICE_PROMPTS[input.prompt]
  const label = input.label.trim().slice(0, 30)
  if (!text || !label || !input.ownVoice || !input.cloneConsent || !input.audio.byteLength || input.audio.byteLength > 2_000_000) return { error: 'invalid' }
  if ((await myVoices(input.userId)).length >= MAX_USER_VOICES) return { error: 'limit' }
  let up: { url: string; headers: Record<string, string> }
  try { up = uploadBase() } catch { return { error: 'unavailable' } }
  const res = await fetch(`${up.url}/voices`, { method: 'POST', headers: up.headers, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ audio: Buffer.from(input.audio).toString('base64'), text }) }).catch(() => null)
  const out = res?.ok ? await res.json().catch(() => null) as { id?: string; seconds?: number; error?: VoiceUploadError } | null : null
  if (!out) return { error: 'unavailable' }
  if (out.error || !out.id || !/^[0-9a-f]{64}$/.test(out.id)) return { error: out.error ?? 'unavailable' }
  const id = `u-${randomBytes(8).toString('hex')}`, now = new Date().toISOString()
  await db.insert(officialVoices).values({
    id, label, provider: 'drama3', providerVoiceId: out.id, status: 'pending', ownerId: input.userId,
    shared: input.shared, adultAllowed: input.adult,
    samples: [{ path: `modal:miro-user-voices/${out.id}/ref.wav`, sha256: out.id, durationSec: out.seconds ?? 0 }],
    rights: { basis: 'self-recorded', ownVoice: true, cloneAndService: true, shared: input.shared, adult: input.adult, prompt: text,
      termsVersion: input.termsVersion, privacyVersion: input.privacyVersion, consentedAt: now },
    approval: {},
  }).onConflictDoNothing()
  return { id }
}

/**
 * 녹음을 시작할 때 GPU 를 깨운다 — 녹음·동의하는 30초 동안 켜지는 시간(24~33초)을 숨긴다. 기다리지 않는다.
 * ponytail: 회원별 횟수 제한은 없다 — 음성 서버가 1대(max_containers=1)라 최악도 시간당 H200 1대 값. 남용이 보이면 회원별 10분 1회로.
 */
export async function warmVoiceServer(): Promise<void> {
  try { const up = uploadBase(); await fetch(`${up.url}/warm`, { method: 'POST', headers: up.headers, signal: AbortSignal.timeout(5_000) }) } catch { /* 깨우기 실패는 미리 듣기가 조금 늦어질 뿐 */ }
}

/** 미리 듣기 파일 — 아직 만드는 중이면 'pending'. */
export async function voicePreview(userId: string, id: string): Promise<ArrayBuffer | 'pending' | null> {
  const [row] = await db.select({ file: officialVoices.providerVoiceId }).from(officialVoices)
    .where(and(eq(officialVoices.id, id), eq(officialVoices.ownerId, userId), ne(officialVoices.status, 'retired'))).limit(1)
  if (!row) return null
  const up = uploadBase()
  const res = await fetch(`${up.url}/voices/${row.file}/preview`, { headers: up.headers, signal: AbortSignal.timeout(20_000) })
  if (res.status === 202) return 'pending'
  return res.ok ? res.arrayBuffer() : null
}

/**
 * 만들기 화면의 미리 듣기 막대(10/31) — 이 회원이 고를 수 있는 목소리의 짧은 견본. id '' = 기본 목소리(음성 서버 DEFAULT_VOICE asmr01).
 * 회원 목소리는 올릴 때 만든 미리 듣기, 공식 목소리는 처음 누를 때 GPU 가 한 번 만들어 둔 파일. 없으면 만들게 하고 'pending'.
 */
export async function voiceSample(userId: string, id: string): Promise<ArrayBuffer | 'pending' | null> {
  let path: string
  if (!id) path = '/samples/asmr01'
  else {
    const [row] = await db.select({ file: officialVoices.providerVoiceId, ownerId: officialVoices.ownerId }).from(officialVoices)
      .where(and(eq(officialVoices.id, id), selectable(userId))).limit(1)
    if (!row) return null
    path = row.ownerId ? `/voices/${row.file}/preview` : `/samples/${row.file}`
  }
  const up = uploadBase()
  const res = await fetch(`${up.url}${path}`, { headers: up.headers, signal: AbortSignal.timeout(20_000) })
  if (res.status === 202) {
    if (path.startsWith('/samples/')) {
      const made = await fetch(`${up.url}${path}`, { method: 'POST', headers: up.headers, signal: AbortSignal.timeout(10_000) }).catch(() => null)
      if (made?.status === 404) return null   // 음성 서버에 실제 파일이 없는 목소리
    }
    return 'pending'
  }
  return res.ok ? res.arrayBuffer() : null
}

/** 미리 듣기 뒤 '등록' — 이때부터 캐릭터에 고를 수 있다. */
export async function activateUserVoice(userId: string, id: string): Promise<boolean> {
  // 실제로 있는 음성만 등록한다 — 미리 듣기가 만들어졌다 = 음성 서버에 녹음이 있고 그 목소리로 읽힌다(10/31 사용자)
  if (!(await voicePreview(userId, id).catch(() => null) instanceof ArrayBuffer)) return false
  const done = await db.update(officialVoices).set({ status: 'active', activatedAt: new Date(), approval: { by: 'owner', previewedAt: new Date().toISOString() } })
    .where(and(eq(officialVoices.id, id), eq(officialVoices.ownerId, userId), eq(officialVoices.status, 'pending'))).returning({ id: officialVoices.id })
  return done.length > 0
}

/** 공개·언베일 사용 바꾸기. 동의 기록에도 바뀐 시각을 남긴다. */
export async function updateUserVoice(userId: string, id: string, patch: { shared?: boolean; adultAllowed?: boolean }) {
  const [row] = await db.select({ rights: officialVoices.rights }).from(officialVoices)
    .where(and(eq(officialVoices.id, id), eq(officialVoices.ownerId, userId), ne(officialVoices.status, 'retired'))).limit(1)
  if (!row) return
  const changes = [...((row.rights.changes as unknown[] | undefined) ?? []), { ...patch, at: new Date().toISOString() }]
  await db.update(officialVoices).set({ ...patch, rights: { ...row.rights, changes } }).where(eq(officialVoices.id, id))
}

/**
 * 삭제 — 녹음 파일을 Modal 에서 먼저 지우고(처리방침: 삭제하면 바로 파기) 행은 retired 로 남긴다.
 * 이 목소리를 고른 다른 회원의 캐릭터는 그때부터 목소리 없이 글로만 보인다(voiceUsable).
 */
export async function retireUserVoices(userId: string, ids?: string[]): Promise<void> {
  const rows = await db.select({ id: officialVoices.id, file: officialVoices.providerVoiceId }).from(officialVoices)
    .where(and(eq(officialVoices.ownerId, userId), ne(officialVoices.status, 'retired'), ...(ids ? [inArray(officialVoices.id, ids)] : [])))
  await removeVoiceFiles(rows)
}

/**
 * 정리 크론: 등록하지 않고 하루가 지난 녹음, 운영자가 관리자 콘솔에서 내린 회원 목소리(파일이 남은 것)의 녹음을 지운다.
 * samples 가 비어 있으면 파일을 이미 지운 것이다.
 */
export async function purgeAbandonedVoices(now = new Date()): Promise<number> {
  const rows = await db.select({ id: officialVoices.id, file: officialVoices.providerVoiceId }).from(officialVoices)
    .where(and(isNotNull(officialVoices.ownerId), sql`${officialVoices.samples} <> '[]'::jsonb`, or(
      and(eq(officialVoices.status, 'pending'), lt(officialVoices.activatedAt, new Date(now.getTime() - 86_400_000))),
      eq(officialVoices.status, 'retired'))))
  await removeVoiceFiles(rows)
  return rows.length
}

async function removeVoiceFiles(rows: Array<{ id: string; file: string }>) {
  if (!rows.length) return
  const up = uploadBase()
  for (const r of rows) {
    const res = await fetch(`${up.url}/voices/${r.file}`, { method: 'DELETE', headers: up.headers, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`voice_delete_failed ${res.status}`)
    await db.update(officialVoices).set({ status: 'retired', retiredAt: sql`coalesce(${officialVoices.retiredAt}, now())`, shared: false, samples: [] }).where(eq(officialVoices.id, r.id))
  }
}
