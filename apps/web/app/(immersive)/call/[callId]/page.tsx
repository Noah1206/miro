import { feature, characterAgencyMode, voiceCallAllowed } from '@miro/config'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { buildSpokenSystem } from '@miro/engine'
import { resolveCallMedia } from '@miro/providers'
import type { CallMediaSession } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { owned } from '@/lib/call/service'
import { loadSession } from '@/lib/simulation/snapshot'
import { contextFromWorld, getOrGenerate } from '@/lib/simulation/media'
import { CallComposer, HangUp } from './ui'
import { LiveAudio } from './live-audio'
import { CharacterText } from '@/components/scene/text'

/** 음성/영상 통화 화면. 채널은 수락 전에 정해져 있으므로 여기서 바뀌지 않는다. */
export default async function CallPage({ params }: { params: Promise<{ callId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { callId } = await params
  const call = await owned(user.id, callId)
  if (!call || !(call.channel === 'voice' ? voiceCallAllowed(user.id) : feature('videoCall'))) notFound()
  if (call.status !== 'active') redirect(`/chat/${call.sessionId}`)

  const loaded = await loadSession(call.sessionId, user.id)
  if (!loaded || loaded.restricted) notFound()

  // 통화용 시스템 프롬프트 — Chat 과 같은 성격·관계·기억·장면·최근 대화에 통화 모드 규칙을 얹고,
  // JSON 계약처럼 소리로 나갈 수 없는 것은 뺀다. 토큰에 잠기므로 클라이언트가 바꿀 수 없다.
  const spokenSystem = call.channel === 'voice'
    ? buildSpokenSystem({ ...loaded.snapshot, mode: 'voice_call' }) + [
      '', '## 실시간 통화 규칙',
      '- 지금은 실제 음성 통화다. 한국어로 말한다.',
      '- 말하듯 짧게 — 한 번에 한두 문장. 긴 독백을 하지 않는다.',
      '- 소리 내어 읽을 수 없는 것(괄호 지문, 이모지, 특수문자, 목록)은 쓰지 않는다.',
    ].join('\n')
    : null

  const provider = resolveCallMedia(call.channel)
  let media: CallMediaSession
  try {
    // Streaming audio currently bypasses server action approval/commit. Keep experimental sessions
    // on the existing text-call adapter until streamed turns have the same authority boundary.
    if (characterAgencyMode(call.sessionId) === 'live') throw new Error('agency_requires_server_turns')
    media = await provider.startSession({
      callId, characterName: loaded.characterName, voiceIdentity: null, visualPrompt: null,
      systemInstruction: spokenSystem,
    })
  } catch {
    // 실시간 세션을 못 열어도 통화는 끊지 않는다 — 텍스트 통화로 강등한다 (명세서 5.2 예외).
    media = { token: '', mode: 'mock', connectUrl: null }
  }

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
        {media.mode === 'mock' && <p role="status" className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>⚠ {provider.info.notice ?? '실시간 음성을 시작하지 못했어요 — 텍스트로 진행합니다.'}</p>}
        {media.mode === 'live' && media.connectUrl && call.channel === 'voice' && (
          <LiveAudio token={media.token} url={media.connectUrl} model={media.model ?? ''} />
        )}
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
