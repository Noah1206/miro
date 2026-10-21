import { and, eq } from 'drizzle-orm'
import { characters, contactProfiles, db, messages, officialVoices, roleplaySessions, userSettings } from '@miro/db'
import { resolveTts } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { spokenStyle, spokenText } from '@/lib/voice-text'

export const runtime = 'nodejs'

/**
 * 몰입 모드(10/19): 저장된 캐릭터 메시지 하나를 그 캐릭터 목소리로 읽는다.
 * 글은 클라이언트가 아니라 DB 의 메시지에서 꺼낸다 — 합성 서버 비용을 아무 글에나 쓰게 두지 않는다.
 * 서버 미구성이면 204 — 화면은 브라우저 읽기로 대신한다.
 */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null) as { sessionId?: unknown; messageId?: unknown } | null
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '', messageId = typeof body?.messageId === 'string' ? body.messageId : ''
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(messageId)) return new Response(null, { status: 400 })
  const [row] = await db.select({ role: messages.role, content: messages.content, blocks: messages.blocks, presentation: contactProfiles.presentation, voice: officialVoices.providerVoiceId, voiceStatus: officialVoices.status })
    .from(messages)
    .innerJoin(roleplaySessions, and(eq(roleplaySessions.id, messages.sessionId), eq(roleplaySessions.userId, user.id)))
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .leftJoin(officialVoices, eq(officialVoices.id, characters.voiceId))
    .where(and(eq(messages.id, messageId), eq(messages.sessionId, sessionId))).limit(1)
  if (!row) return new Response(null, { status: 404 })
  if (row.role !== 'character' || (row.presentation?.media ?? 'text') === 'text') return new Response(null, { status: 403 })
  const text = spokenText(row.blocks, row.content)
  const tts = resolveTts()
  if (!text || !tts) return new Response(null, { status: 204 })
  const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  try {
    const out = await tts.speak({ text, voice: row.voiceStatus === 'active' ? row.voice : null, language: settings?.language ?? 'ko', style: spokenStyle(row.blocks) }, AbortSignal.timeout(30_000))
    return new Response(out.audio, { headers: { 'content-type': out.contentType, 'cache-control': 'private, max-age=3600' } })
  } catch (error) {
    console.warn('[tts]', error instanceof Error ? error.message : error)
    return new Response(null, { status: 204 })
  }
}
