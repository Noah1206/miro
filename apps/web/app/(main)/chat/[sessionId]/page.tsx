// 사진 만들기(서버 액션)가 이 페이지에서 돈다 — 그림 서버가 처음 켜질 때 1~3분 걸려도 요청이 끊기지 않게(11/9).
export const maxDuration = 300

import { ChatTheme } from '@/components/chat-theme'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { notFound, redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db, messages, characters, roleplaySessions } from '@miro/db'
import { pickAutoVoice, voiceOptions } from '@/lib/voice'
import { currentUser } from '@/lib/auth'
import { accountProfile } from '@/lib/account-profile'
import { loadSession } from '@/lib/simulation/snapshot'
import { adultModeGateFor, matureGateFor } from '@/lib/ops/safety'
import { sessionMedia } from '@/lib/call/service'
import { Back, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import { COPY } from '@/lib/copy'
import { PushSubscribe } from '@/components/push-subscribe'
import { ChatComposer } from './composer'
import { getPersona, needsPersona } from '@/lib/persona'
import { WorldIntro } from './world-intro'
import { MessageList, type Msg } from './messages'
import { ChatModelProvider } from './model-picker'
import { chatModelOptions, recommendedChoice } from '@/lib/ai/chat-models'
import { TurnsProvider } from './turns'
import { sceneMessages } from '@/lib/messenger'
import { getT } from '@/lib/i18n/server'
import { msg } from '@/lib/i18n'
import { CoachMarks, type CoachStep } from '@/components/coach-marks'
import { ImmersiveProvider, VoiceStatus } from './immersive'
import { RoomMenu } from '@/components/room-menu'
import { feature } from '@miro/config'
import { ensembleNames } from '@miro/engine'
import { CharacterPhoto } from '@/components/character-visual'
import { isUnveilPhoto } from '@/lib/unveil-photo'
import { modalImageReady } from '@/lib/ai/modal-image'
import { customSceneId } from '@/lib/photo-scenes'

/** 처음 들어온 대화 화면에서 짚어 주는 기능(10/19). 화면에 없는 버튼(테마에 따라 다름)은 건너뛴다. */
const CHAT_COACH: CoachStep[] = [
  { target: 'narration', title: msg('행동이나 상황을 표현하고 싶을 때 내용 앞뒤로 *를 붙여보세요.'), example: msg('예시) *수줍게 그를 바라보며* 보고싶었어…') },
  { target: 'model', title: msg('대화 방식을 바꿀 수 있어요.'), example: msg('기본 대화와 더 긴 대화 중에서 골라 보세요.') },
]

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const t = await getT()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  // 세션·기록·요금제·성인 판정은 서로를 기다릴 이유가 없다 — 한 번의 왕복 시간에 다 읽는다.
  // 10/27: 화면용 로더(view)로 AI 턴 전용 조회를 건너뛰고(언베일 판정은 그대로), 지갑 조회를 뺐다
  // (지갑은 레이아웃이 처음·포커스·실시간·턴 뒤에 읽는다). 몰입 모드 유형은 방 주인 조건으로 같은 바퀴에 읽는다.
  const session = loadSession(sessionId, user.id, '', { view: true })
  const [loaded, all, modelOptions, mature, adult, media, profile, rec, myPersona, needPersona] = await Promise.all([
    session,
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    session.then(l => chatModelOptions(user.id, l?.adult.since !== null && !!l)),
    session.then((l) => l && matureGateFor(user.id, l.characterId)),
    session.then((l) => l && adultModeGateFor(user.id, l.characterId, sessionId)),
    // 유형(10/19) — 몰입 모드(음성/음성+영상)로 만든 캐릭터만 방 머리에 몰입 모드 단추가 있다.
    sessionMedia(sessionId, user.id),
    accountProfile(user),
    // 권장 대화 설정(10/28) — 제작자가 고른 모델·출력량이 새 채팅의 처음 선택값.
    session.then(l => l ? db.select({ rec: characters.recommendedChat, scenes: characters.photoScenes, audience: characters.audience, presets: characters.presetPersonas, guide: characters.personaGuide, playGuide: characters.playGuide, firstReplies: characters.firstReplies, endings: characters.endings, ensembleVoices: characters.ensembleVoices, coverUnveil: characters.coverUnveil, voiceId: characters.voiceId }).from(characters).where(eq(characters.id, l.characterId)).limit(1).then(r => r[0] ?? null) : null),
    // 페르소나 드롭다운(11/3) — 내 기본 페르소나도 고를 수 있게.
    getPersona(user.id),
    // 첫 대화 전 세계관 카드(11/4) — 이 방의 '나'를 적기 전에는 입력창 대신 카드가 뜬다.
    needsPersona(user.id, sessionId),
  ])
  // 11/8 방에서 화자별 목소리 고르기 — 고를 수 있는 목소리, 이 방에서 고른 것, 화자마다 지금 쓰는 기본(만든 사람이 정한 것 → 자동).
  const roomVoice = feature('characterVoice') && rec ? await (async () => {
    const [options, [ov]] = await Promise.all([voiceOptions(user.id), db.select({ o: roleplaySessions.voiceOverrides }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).limit(1)])
    const official = options.filter(o => !o.id.startsWith('u-'))
    const names = Object.keys(rec.ensembleVoices ?? {}).sort()
    const labelOf = (id: string | null | undefined) => options.find(o => o.id === id)?.label.split(' · ')[0] ?? null
    const auto = (slot: number) => labelOf(pickAutoVoice(official, loaded!.characterId, rec.audience, slot))
    const speakers = [{ key: '', name: loaded!.characterName, defaultLabel: labelOf(rec.voiceId) ?? auto(0) },
      ...names.map((n, i) => ({ key: n, name: n, defaultLabel: labelOf(rec.ensembleVoices![n]) ?? auto(i + 1) }))]
    return { speakers, options, overrides: ov?.o ?? {} }
  })() : undefined
  if (!loaded || !mature) notFound()
  // 11/6: 언베일 표지 캐릭터는 언베일을 안 켠 사람에게 대화 속 사진(인트로·상황 사진)도 흐린다.
  const veilPhotos = !!rec?.coverUnveil && !(await homeUnveilEnabled(user.id))
  // 문자·통화 기록은 /messages 의 것이다. 여기는 만나서 나눈 장면만 — 문자로 보낸 사진도 저쪽으로.
  const history = sceneMessages(all)

  const s = loaded.snapshot
  // 11/6: 여러 인물 카드 — 인물 순서대로 갤러리 사진을 아바타로(이름 첫 글자 대신).
  // 11/7: 언베일 사진은 건너뛴다 — 갤러리가 일반→언베일 짝이어도 인물 순서가 어긋나지 않게.
  const cast = ensembleNames(s.character.personality.secret)
  const castImages = (loaded.characterImages ?? []).filter(src => !isUnveilPhoto(src))
  const castPhotos = Object.fromEntries(cast.flatMap((name, i) => castImages[i] ? [[name, castImages[i]!]] : []))
  const items: Msg[] = history.map((m) => ({
    id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
    content: m.hiddenAt ? t('운영 정책에 따라 숨김 처리된 메시지입니다.') : m.content,
    blocks: m.blocks as Array<Record<string, unknown>>, at: m.createdAt.toISOString(),
    opening: m.turnIndex <= 0 && !m.hiddenAt && (m.kind === 'text' || m.kind === 'photo') && (m.role === 'character' || m.role === 'narrator'),
  }))
  if (history.length === 0 && s.character.worldRole.startingContext) items.push({
    id: `opening:${sessionId}`, role: 'narrator', kind: 'text', content: s.character.worldRole.startingContext, blocks: [], opening: true,
  })

  return (
    <ChatModelProvider key={`${sessionId}:${loaded.adult.since !== null}`} initialModel={recommendedChoice(modelOptions.choices, rec?.rec) ?? modelOptions.choices[0]?.id} storageKey={`miro:chat-model:character:${loaded.characterId}`} modelChoices={modelOptions.choices.map(choice => choice.id)}><TurnsProvider><ImmersiveProvider sessionId={sessionId} media={media} enabled={feature('characterVoice')} portrait={loaded.characterPhoto} initialMessages={items} characterName={loaded.characterName} voiceSpeakers={Object.keys(rec?.ensembleVoices ?? {})}><ChatTheme key={sessionId} sessionId={sessionId}><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <div className={styles.headerIdentity}><div className={styles.headerTitleRow}>{loaded.characterPhoto && <span className={styles.headerAvatar} aria-hidden><CharacterPhoto src={loaded.characterPhoto} alt="" size="avatar" sizes="32px" width={32} height={32} /></span>}<h1 className={styles.title}>{loaded.characterName}</h1></div></div>
          {loaded.adult.since !== null && <TransitionLink href="/home" className="t-micro">{t('언베일')}</TransitionLink>}
          <RoomMenu sessionId={sessionId} initialPersona={s.userPersona ?? null} characterName={loaded.characterName} profile={profile} entry={loaded.entry} portrait={loaded.characterPhoto} messengerHref={loaded.experienceType === 'reality' ? `/messages/${sessionId}` : undefined} characterHref={`/character/${loaded.characterId}`} choices={modelOptions.choices} turnCount={s.turnCount} roomVoice={roomVoice} />
        </header>
        <VoiceStatus />

        <div className={styles.transcript}>
          {/* 'AI가 생성한 대화예요' 줄은 뺐다(2026-10-02 사용자: 사람처럼 느껴져야 한다). AI 라는 안내는 가입 때 필수 동의(AI 생성 콘텐츠 안내)로 한다. */}
          {loaded.restricted && <p data-restricted role="status" className="t-caption" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{t('운영 정책에 따라 이 역할극은 제한되었습니다.')}</p>}
          {loaded.experienceType === 'reality' && s.activeEvents[0] && (
            <aside style={{ marginBottom: 'var(--space-5)', padding: '14px 16px', borderLeft: '2px solid var(--color-accent)', background: 'var(--color-surface-1)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
              <h2 className="t-micro" style={{ marginBottom: 4 }}>{t('지금 이 세계에서')}</h2>
              <p className="t-body t-quote">{String((s.activeEvents[0].continuationState as { summary?: string }).summary ?? s.activeEvents[0].type)}</p>
            </aside>
          )}
          {/* 플레이 가이드(11/10, 크랙) — 첫 턴 전에만, 사용자에게만 보이는 안내. AI 에는 가지 않는다. */}
          {s.turnCount === 0 && rec?.playGuide && <aside className={styles.playGuide} aria-label={t('플레이 가이드')}>
            <strong>{t('플레이 가이드')}</strong><p>{rec.playGuide}</p>
          </aside>}
          <MessageList endings={rec?.endings ?? []} sessionId={sessionId} hasStarted={s.turnCount > 0} items={items} characterName={loaded.characterName} portrait={loaded.characterPhoto} mood={s.characterState?.mood ?? 'neutral'} veilPhotos={veilPhotos} cast={cast} castPhotos={castPhotos} photo={feature('imageGeneration') && !loaded.restricted ? { unveil: !!adult?.allowed, bundle: modalImageReady(), audience: rec?.audience, scenes: (rec?.scenes ?? []).map((scene, i) => ({ id: customSceneId(i), label: scene.label, unveil: !!scene.unveil })) } : undefined} />
          {needPersona && <WorldIntro sessionId={sessionId} worldSetting={s.worldSetting ?? null} guide={rec?.guide ?? ''} presets={rec?.presets ?? []} personality={s.character.personality.personality} audience={rec?.audience ?? null} />}
        </div>

        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 미로 캐릭터 대화방에서 알림 권한을 묻는다. */}
        {loaded.experienceType === 'reality' && <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name={loaded.characterName} />}
        {/* The room menu keeps the DM link; the model picker lives in the composer. */}
        <CoachMarks storageKey="miro:tour:chat" steps={CHAT_COACH} />
        {!needPersona && <ChatComposer sessionId={sessionId} characterName={loaded.characterName} firstReplies={s.turnCount === 0 ? rec?.firstReplies : undefined} modelOptions={modelOptions} messengerHref={loaded.experienceType === 'reality' ? `/messages/${sessionId}` : undefined} commands={loaded.commands}
          persona={{ sessionId, current: loaded.snapshot.userPersona ?? null, mine: myPersona, presets: rec?.presets ?? [] }}
          photo={feature('imageGeneration') && !loaded.restricted ? { unveil: !!adult?.allowed, bundle: modalImageReady(), audience: rec?.audience, scenes: (rec?.scenes ?? []).map((scene, i) => ({ id: customSceneId(i), label: scene.label, unveil: !!scene.unveil })) } : undefined} />}
      </section>

    </main></ChatTheme></ImmersiveProvider></TurnsProvider></ChatModelProvider>
  )
}
