import { notFound, redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { resolveCallMedia } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { owned } from '@/lib/call/service'
import { loadSession } from '@/lib/simulation/snapshot'
import { contextFromWorld, getOrGenerate } from '@/lib/simulation/media'
import { CallComposer, HangUp } from './ui'
import { CharacterText } from '@/components/scene/text'

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
    <main id="main" tabIndex={-1} data-call-channel={call.channel} className="page page--immersive" style={{ outline: 'none',
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--color-bg-deep)',
    }}>
      {face && <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url(${face})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: face ? 'linear-gradient(to top, rgba(0,0,0,0.94) 30%, rgba(0,0,0,0.35))' : 'transparent' }} />
      <header style={{ position: 'relative', padding: '32px 24px 8px', textAlign: 'center' }}>
        <p className="t-micro">{call.channel === 'voice' ? '음성통화' : '영상통화'} · {loaded.snapshot.world.currentLocation}</p>
        <h1 className="t-display t-name" style={{ marginTop: 10 }}>{loaded.characterName}</h1>
        {media.mode === 'mock' && <p role="status" className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>⚠ {provider.info.notice}</p>}
      </header>
      <div style={{ position: 'relative', flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {lines.map((m) => m.role === 'user'
          ? <p key={m.id} className="t-caption" style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>{m.content}</p>
          : <div key={m.id} style={{ textShadow: '0 1px 10px rgba(0,0,0,.7)' }}><CharacterText content={m.content} name={loaded.characterName} size="lg" /></div>)}
      </div>
      <CallComposer callId={callId} />
      <HangUp callId={callId} />
    </main>
  )
}
