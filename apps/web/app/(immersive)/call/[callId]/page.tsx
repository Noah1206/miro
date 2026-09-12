import { notFound, redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { resolveCallMedia } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { owned } from '@/lib/call/service'
import { loadSession } from '@/lib/simulation/snapshot'
import { contextFromWorld, getOrGenerate } from '@/lib/simulation/media'
import { CallComposer, HangUp } from './ui'

/** 음성/영상 통화 화면. 채널은 수락 전에 정해져 있으므로 여기서 바뀌지 않는다. */
export default async function CallPage({ params }: { params: Promise<{ callId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { callId } = await params
  const call = await owned(user.id, callId)
  if (!call) notFound()
  if (call.status !== 'active') redirect(`/chat/${call.sessionId}`)

  const loaded = await loadSession(call.sessionId, user.id)
  if (!loaded) notFound()

  const provider = resolveCallMedia(call.channel)
  const media = await provider.startSession({
    callId, characterName: loaded.characterName, voiceIdentity: null, visualPrompt: null,
  })

  // 영상통화: Visual Identity 기반 정지 이미지 + 현재 장면 배경. 실시간 표정/입모양은 Provider 확정 후.
  let face: string | null = null
  if (call.channel === 'video') {
    const ctx = await contextFromWorld(call.sessionId)
    if (ctx) {
      face = (await getOrGenerate({
        sessionId: call.sessionId, characterId: loaded.characterId, characterName: loaded.characterName,
        kind: 'live_scene', context: ctx, aspect: '3:4', usage: null,   // 통화 사용량에 포함
      }).catch(() => null))?.url ?? null
    }
  }

  const lines = (await db.select().from(messages)
    .where(and(eq(messages.sessionId, call.sessionId), eq(messages.kind, 'text')))
    .orderBy(desc(messages.turnIndex), desc(messages.createdAt)).limit(12))
    .filter((m) => (m.blocks as Array<{ type: string; text?: string }>).some((b) => b.type === 'call_line' && b.text === callId) || m.role === 'user')
    .reverse()

  return (
    <main data-call-channel={call.channel} style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: face ? `linear-gradient(rgba(14,14,16,.35), rgba(14,14,16,.92)), url(${face}) center/cover` : 'var(--bg)',
    }}>
      <header style={{ padding: '28px 24px 8px', textAlign: 'center' }}>
        <p style={{ fontSize: 11.5, letterSpacing: '0.14em', color: 'var(--text-secondary)', margin: 0 }}>
          {call.channel === 'voice' ? '음성통화' : '영상통화'} · {loaded.snapshot.world.currentLocation}
        </p>
        <h1 style={{ fontSize: 26, margin: '8px 0 0', fontWeight: 600 }}>{loaded.characterName}</h1>
        {media.mode === 'mock' && (
          <p role="status" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 10 }}>⚠ {provider.info.notice}</p>
        )}
      </header>

      <div style={{ flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10 }}>
        {lines.map((m) => (
          <p key={m.id} style={{
            margin: 0, fontSize: m.role === 'user' ? 14 : 16, lineHeight: 1.7,
            color: m.role === 'user' ? 'var(--text-secondary)' : 'var(--text-primary)',
            textAlign: m.role === 'user' ? 'right' : 'left', textShadow: '0 1px 10px rgba(0,0,0,.6)',
          }}>{m.content.replace(/^[^:]+: /, '')}</p>
        ))}
      </div>

      <CallComposer callId={callId} />
      <HangUp callId={callId} />
    </main>
  )
}
