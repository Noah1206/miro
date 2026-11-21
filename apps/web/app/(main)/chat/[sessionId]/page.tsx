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
import { unreadContactCount } from '@/lib/ops/archive'
import { ChatSiteHeader } from './site-header'
import { loadSession } from '@/lib/simulation/snapshot'
import { adultModeGateFor, matureGateFor } from '@/lib/ops/safety'
import { sessionMedia } from '@/lib/call/service'
import { Back, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import { COPY } from '@/lib/copy'
import { ChatComposer } from './composer'
import { getPersona, needsPersona } from '@/lib/persona'
import { WorldIntro } from './world-intro'
import { MessageList, type Msg } from './messages'
import { ChatModelProvider } from './model-picker'
import { chatModelOptions, middleLength, recommendedChoice } from '@/lib/ai/chat-models'
import { TurnsProvider } from './turns'
import { sceneMessages } from '@/lib/messenger'
import { getT } from '@/lib/i18n/server'
import { msg } from '@/lib/i18n'
import { CoachMarks, type CoachStep } from '@/components/coach-marks'
import { ImmersiveProvider, VoiceStatus } from './immersive'
import { ChatBgm } from './bgm'
import { explicitText, VEILED_LINE } from '@/lib/explicit-text'
import { RoomMenu } from '@/components/room-menu'
import { HomeUnveilToggle } from '@/app/(main)/home/unveil-toggle'
import { feature, voicePaused } from '@miro/config'
import { castNames } from '@miro/engine'
import { coverTitle } from '@/lib/editorial/cover-title'
import { heroineName, leadName } from '@/lib/editorial/heroine-name'
import { fillCharacterMacros } from '@miro/domain'
import { isUnveilPhoto } from '@/lib/unveil-photo'
import { modalImageReady } from '@/lib/ai/modal-image'
import { customSceneId } from '@/lib/photo-scenes'

/** 처음 들어온 대화 화면에서 짚어 주는 기능(10/19). 화면에 없는 버튼(테마에 따라 다름)은 건너뛴다. */
const CHAT_COACH: CoachStep[] = [
  { target: 'narration', title: msg('행동이나 상황을 표현하고 싶을 때 내용 앞뒤로 *를 붙여보세요.'), example: msg('예시) *수줍게 그를 바라보며* 보고싶었어…') },
  { target: 'model', title: msg('대화 방식을 바꿀 수 있어요.'), example: msg('기본 대화와 더 긴 대화 중에서 골라 보세요.') },
  // 11/21 사용자: 음성 모드 안내 + 메뉴(슬라이드)를 자동으로 열어 목소리 고르는 곳 안내.
  { target: 'voice', title: msg('음성 모드를 켜면 캐릭터가 목소리로 말해요.'), example: msg('이 스위치로 언제든 켜고 끌 수 있어요.') },
  { target: 'voice-pick', open: 'menu', title: msg('메뉴에서 목소리도 고를 수 있어요.'), example: msg('음성 모드를 켜면 바로 아래에 캐릭터의 목소리 목록이 나와요.') },
]

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const t = await getT()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  // 11/16 잘린 주소(/chat/991da667 같은)로 들어오면 DB 가 uuid 형식 오류를 내 500 이 됐다 — 없는 방으로 처리한다.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) notFound()
  // 세션·기록·요금제·성인 판정은 서로를 기다릴 이유가 없다 — 한 번의 왕복 시간에 다 읽는다.
  // 10/27: 화면용 로더(view)로 AI 턴 전용 조회를 건너뛰고(언베일 판정은 그대로), 지갑 조회를 뺐다
  // (지갑은 레이아웃이 처음·포커스·실시간·턴 뒤에 읽는다). 몰입 모드 유형은 방 주인 조건으로 같은 바퀴에 읽는다.
  const session = loadSession(sessionId, user.id, '', { view: true })
  // 11/21 사용자('이어서 진행하러 갈 때 너무 늦게 들어가진다'): 아래 두 묶음도 처음부터 같이 읽는다 — 전엔 첫 묶음이 끝난 뒤 차례로 읽어
  // 긴 방에서 0.3~0.4초가 더 걸렸다(운영 실측: 첫 묶음 ~0.5초 + 목소리 ~0.17초 + 언베일·안 읽은 수 ~0.23초). 먼저 끝나 거절돼도 처리되게 catch 를 걸어 둔다.
  const voiceData = feature('characterVoice') ? Promise.all([voiceOptions(user.id), db.select({ o: roleplaySessions.voiceOverrides }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).limit(1)]) : null
  const extras = Promise.all([homeUnveilEnabled(user.id), unreadContactCount(user.id)])
  voiceData?.catch(() => {}); extras.catch(() => {})
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
    session.then(l => l ? db.select({ rec: characters.recommendedChat, scenes: characters.photoScenes, audience: characters.audience, presets: characters.presetPersonas, guide: characters.personaGuide, playGuide: characters.playGuide, firstReplies: characters.firstReplies, endings: characters.endings, ensemblePhotos: characters.ensemblePhotos, ensembleVoices: characters.ensembleVoices, bgm: characters.bgm, coverUnveil: characters.coverUnveil, voiceId: characters.voiceId }).from(characters).where(eq(characters.id, l.characterId)).limit(1).then(r => r[0] ?? null) : null),
    // 페르소나 드롭다운(11/3) — 내 기본 페르소나도 고를 수 있게.
    getPersona(user.id),
    // 첫 대화 전 세계관 카드(11/4) — 이 방의 '나'를 적기 전에는 입력창 대신 카드가 뜬다.
    needsPersona(user.id, sessionId),
  ])
  // 11/8 방에서 화자별 목소리 고르기 — 고를 수 있는 목소리, 이 방에서 고른 것, 화자마다 지금 쓰는 기본(만든 사람이 정한 것 → 자동).
  const roomVoice = voiceData && rec ? await (async () => {
    const [options, [ov]] = (await voiceData)!
    const official = options.filter(o => !o.id.startsWith('u-'))
    const names = Object.keys(rec.ensembleVoices ?? {}).sort()
    const labelOf = (id: string | null | undefined) => options.find(o => o.id === id)?.label.split(' · ')[0] ?? null
    const auto = (slot: number) => labelOf(pickAutoVoice(official, loaded!.characterId, rec.audience, slot))
    // 11/11 사용자: 등장인물이 있는 작품은 작품 이름 줄(주 화자)을 빼고 인물만 보인다. 11/19 1:1 작품도 작품 이름 대신 작품 안 인물 이름(leadName).
    const speakers = [...(names.length ? [] : [{ key: '', name: leadName({ name: loaded!.characterName, secret: loaded!.snapshot.character.personality.secret, personality: loaded!.snapshot.character.personality.personality, cast: loaded!.snapshot.character.worldRole.cast }), defaultLabel: labelOf(rec.voiceId) ?? auto(0) }]),
      ...names.map((n, i) => ({ key: n, name: n, defaultLabel: labelOf(rec.ensembleVoices![n]) ?? auto(i + 1) }))]
    return { speakers, options, overrides: ov?.o ?? {} }
  })() : undefined
  if (!loaded || !mature) notFound()
  // 11/6: 언베일 표지 캐릭터는 언베일을 안 켠 사람에게 대화 속 사진(인트로·상황 사진)도 흐린다.
  const [unveilOn, unread] = await extras
  // 11/12: 표지가 언베일이 아니어도 인트로에 노골적인 글이 있는 작품이면 같이 가린다(lib/explicit-text). 글은 아래 items 에서 가림 문구로 바꾼다.
  const introExplicit = all.some(m => m.turnIndex <= 0 && ((m.kind === 'text' && explicitText(m.content)) || (m.kind === 'photo' && isUnveilPhoto(m.content))))
  const veilPhotos = (!!rec?.coverUnveil || introExplicit) && !unveilOn
  // 문자·통화 기록은 /messages 의 것이다. 여기는 만나서 나눈 장면만 — 문자로 보낸 사진도 저쪽으로.
  const history = sceneMessages(all)

  const s = loaded.snapshot
  // 11/6: 여러 인물 카드 — 인물 순서대로 갤러리 사진을 아바타로(이름 첫 글자 대신).
  // 11/7: 언베일 사진은 건너뛴다 — 갤러리가 일반→언베일 짝이어도 인물 순서가 어긋나지 않게.
  // 11/17 사용자: 만든 사람이 인물마다 올린 사진이 채팅 프로필로 — 공식 '[여러 인물]'뿐 아니라 만들기 화면의 '캐릭터 추가' 인물(ensemble_cast)도 인물 목록에 넣는다.
  const cast = castNames(s.character)
  // 11/17 사용자: 말풍선 위 이름이 작품 이름이면 안 된다 — 1:1 공식 작품은 설정의 '[히로인] 강세라(28) —' 에서 그 인물 이름을 꺼내 인물로 둔다.
  // '[숨긴 사정] · 세실리아는 …'(첫 줄의 인물), '[프로필] 한도은. 27세'(소개 첫 줄) 형식도 같은 식으로(11/17 사용자).
  const heroine = cast.length ? null : heroineName(s.character.personality.secret, s.character.personality.personality)
  if (heroine && heroine !== loaded.characterName) cast.push(heroine)
  const castImages = (loaded.characterImages ?? []).filter(src => !isUnveilPhoto(src))
  // 11/10: 만든 사람이 인물마다 올린 사진(ensemble_photos)이 먼저 — 없을 때만 작품 사진 순서로 대신한다.
  const named = rec?.ensemblePhotos ?? {}
  const castPhotos = { ...Object.fromEntries(cast.flatMap((name, i) => castImages[i] ? [[name, castImages[i]!]] : [])), ...named }
  // 11/18 붙여 넣은 바베챗식 인트로·첫 대사의 {{char}}·{{user}} 를 이름으로(화면도 지시문과 같은 규칙).
  const fill = (text: string) => fillCharacterMacros(text, loaded.characterName, s.userPersona?.name)
  const fillBlocks = (blocks: Array<Record<string, unknown>>) => blocks.map(b => typeof b.text === 'string' ? { ...b, text: fill(b.text) } : b)
  const items: Msg[] = history.map((m) => ({
    id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
    content: m.hiddenAt ? t('운영 정책에 따라 숨김 처리된 메시지입니다.') : !unveilOn && m.turnIndex <= 0 && m.kind === 'text' && explicitText(m.content) ? t(VEILED_LINE) : m.kind === 'text' ? fill(m.content) : m.content,
    blocks: !unveilOn && m.turnIndex <= 0 && m.kind === 'text' && explicitText(m.content) ? [] : fillBlocks(m.blocks as Array<Record<string, unknown>>), at: m.createdAt.toISOString(),
    opening: m.turnIndex <= 0 && !m.hiddenAt && (m.kind === 'text' || m.kind === 'photo') && (m.role === 'character' || m.role === 'narrator'),
  }))
  if (history.length === 0 && s.character.worldRole.startingContext) items.push({
    id: `opening:${sessionId}`, role: 'narrator', kind: 'text', content: !unveilOn && explicitText(s.character.worldRole.startingContext) ? t(VEILED_LINE) : fill(s.character.worldRole.startingContext), blocks: [], opening: true,
  })

  return (
    <ChatModelProvider key={`${sessionId}:${loaded.adult.since !== null}`} initialModel={middleLength(modelOptions.choices, recommendedChoice(modelOptions.choices, rec?.rec) ?? modelOptions.choices[0]?.id)} storageKey={`miro:chat-model:character:${loaded.characterId}`} modelChoices={modelOptions.choices.map(choice => choice.id)}><TurnsProvider><ImmersiveProvider sessionId={sessionId} media={media} enabled={feature('characterVoice')} soon={voicePaused()} portrait={loaded.characterPhoto} initialMessages={items} characterName={loaded.characterName} voiceSpeakers={Object.keys(rec?.ensembleVoices ?? {})}><ChatTheme key={sessionId} sessionId={sessionId}><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <section className={`chat-main ${styles.main}`}>
        <ChatSiteHeader unveil={unveilOn} unread={unread} profile={profile} />
        <header className={styles.header}>
          <Back href="/archive" />
          <div className={styles.headerIdentity}><div className={styles.headerTitleRow}>{/* 11/12 사용자: 헤더에 작품·캐릭터 사진 없이 이름만 */}<h1 className={styles.title}>{coverTitle({ slug: loaded.characterSlug, name: loaded.characterName })}</h1></div></div>
          {loaded.adult.since !== null && <TransitionLink href="/home" className="t-micro">{t('언베일')}</TransitionLink>}
          {(rec?.bgm?.length ?? 0) > 0 && <ChatBgm sessionId={sessionId} />}
          {/* 11/22 사용자: 휴대폰 채팅방 머리에도 19 토글(컴퓨터는 위 사이트 머리에 이미 있다). */}
          <span className={styles.headerUnveil}><HomeUnveilToggle key={String(unveilOn)} enabled={unveilOn} signedIn /></span>
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
          {/* 플레이 가이드(11/10) — 사용자에게만 보이는 안내, AI 에는 가지 않는다. 11/20 사용자: 인트로 바로 밑에, 대화가 이어져도 그 자리에 남는다. */}
          <MessageList afterIntro={rec?.playGuide ? <aside className={styles.playGuide} aria-label={t('플레이 가이드')}><strong>{t('플레이 가이드')}</strong><p>{rec.playGuide}</p></aside> : undefined} endings={rec?.endings ?? []} sessionId={sessionId} hasStarted={s.turnCount > 0} items={items} characterName={loaded.characterName} portrait={loaded.characterPhoto} mood={s.characterState?.mood ?? 'neutral'} veilPhotos={veilPhotos} cast={cast} castPhotos={castPhotos} photo={feature('imageGeneration') && !loaded.restricted ? { unveil: !!adult?.allowed, bundle: modalImageReady(), audience: rec?.audience, scenes: (rec?.scenes ?? []).map((scene, i) => ({ id: customSceneId(i), label: scene.label, unveil: !!scene.unveil })) } : undefined} />
          {needPersona && <WorldIntro sessionId={sessionId} worldSetting={s.worldSetting ?? null} guide={rec?.guide ?? ''} presets={rec?.presets ?? []} personality={s.character.personality.personality} audience={rec?.audience ?? null} />}
        </div>

        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 미로 캐릭터 대화방에서 알림 권한을 묻는다. */}
        {/* The room menu keeps the DM link; the model picker lives in the composer. */}
        {/* 11/21 사용자: 대화방마다 처음 들어왔을 때 무조건 한 번 — 방마다 따로 기억한다. */}
        <CoachMarks storageKey={`miro:tour:chat:v2:${sessionId}`} steps={CHAT_COACH} />
        {/* 11/13 사용자: '이 세계에서의 나'는 선택 — 카드가 떠 있어도 입력창을 같이 보여 준다. */}
        {<ChatComposer sessionId={sessionId} characterName={loaded.characterName} firstReplies={s.turnCount === 0 ? rec?.firstReplies?.map(fill) : undefined} modelOptions={modelOptions} messengerHref={loaded.experienceType === 'reality' ? `/messages/${sessionId}` : undefined} commands={loaded.commands}
          persona={{ sessionId, current: loaded.snapshot.userPersona ?? null, mine: myPersona, presets: rec?.presets ?? [] }}
          photo={feature('imageGeneration') && !loaded.restricted ? { unveil: !!adult?.allowed, bundle: modalImageReady(), audience: rec?.audience, scenes: (rec?.scenes ?? []).map((scene, i) => ({ id: customSceneId(i), label: scene.label, unveil: !!scene.unveil })) } : undefined} />}
      </section>

    </main></ChatTheme></ImmersiveProvider></TurnsProvider></ChatModelProvider>
  )
}
