'use client'
import { introDialogue, introScenes, sampleDialogue } from '@/lib/intro-dialogue'
import { ContactSettings, RelationshipSettings } from './creation-settings'
import type { ProfileStatus } from './profile-settings'
import type { CastProfile, CharacterEnding, CharacterStat, RelationshipProfile } from '@miro/domain'
import type { ContactCapabilities } from '@/lib/reality/channels'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import { GENDER_PRESETS, GENDER_TYPES } from '@miro/domain'
import { CreateHeader, StepNav, type CreateTab } from './header'
import { CreateTour } from './tour'
import { DetailPreview, snapshot, type Snapshot } from './preview'
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, LabeledField, LoreEditor, PresetTags, Switch, TagInput, box, fieldFont, fieldPad, type Step } from './form-parts'
import { SituationImagesEditor } from './situation-images-editor'
import { PhotoScenesEditor } from './photo-scenes-editor'
import { PresetPersonasEditor } from './preset-personas-editor'
import { StatusEditor } from './status-editor'
import { ExamplesEditor } from './examples-editor'
import { EndingsEditor } from './endings-editor'
import { ExtraScenesEditor } from './extra-scenes-editor'
import type { UserPersona } from '@miro/domain'
import type { CustomPhotoScene } from '@/lib/photo-scenes'
import { Segmented, SelectField, StepSlider } from './settings-controls'
import { TransitionLink, useToast } from '@/components/ui'
import { TestChat } from './test-chat'
import { VoiceList, type VoiceOption } from './voice-list'
import { CastProfiles, CastVoices, MBTI_TYPES, castJson, castPhotosJson, castProfilesJson, type CastMember } from './cast-editor'
import { CommandEditor } from './command-editor'
import type { CharacterCommand } from '@miro/db'
import type { CharacterMedia } from '@miro/config'
import { CATEGORIES } from '@/lib/genres'
// 11/12 해시태그 고르기 = 탐색 페이지 필터와 같은 목록(고른 태그가 탐색에서 그대로 걸린다).
import { DISCOVERY_GROUPS } from '@/lib/discovery-filters'
import { activeDraftKey, draftStorageKey, restoreDraft, serializableDraft } from './draft-storage'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

export type FormInitial = {
  name: string; title: string; worldSetting: string; age: string; mbti: string; nationality: string; occupation: string
  personality: string; hobbies: string[]; dislikes: string[]; mood: string[]; jealousy: number; initiative: number; emotionalExpression: number
  gender: string; build: string; height: string; detail: string
  /** 공식 목소리 ID. '' 이면 기본 목소리. */
  voiceId: string
  /** 다인 작품(11/10) 등장인물별 목소리 { 이름: 목소리 id, '' = 자동 }. 비어 있으면 1:1. */
  ensembleVoices?: Record<string, string>
  ensemblePhotos?: Record<string, string>
  ensembleCast?: CastProfile[]
  eyes: string; nose: string; jaw: string; skin: string; distinctive: string
  hairColor: string; hairLength: string; hairStyle: string; expression: string; styleTags: string[]
  stage: string; trust: number; attraction: number; emotionalDistance: number; attachment: number; protectiveness: number; relJealousy: number
  /** 친해지는 곡선. '' 이면 성향값으로 정한다. */
  bonding: string
  /** 관계 성격표 — 저장 때 AI 가 성격 설명에서 만들고 여기서 고친다. 만들기 화면에는 아직 없다. */
  relationshipProfile: RelationshipProfile | null
  profileStatus: ProfileStatus
  relationshipKeywords: string[]
  contactEnabled: boolean; contactFrequency: number; initiativeLevel: number; replyDelayMinutes: number
  activeHoursStart: string; activeHoursEnd: string; preferredChannel: string
  photoProbability: number; voiceMessageProbability: number; callProbability: number; videoCallProbability: number; senderLabel: string
  startingContext: string; worldLocation: string; startingTime: string; sampleDialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string; purpose?: 'intro' }>
  lore: Array<{ keywords: string[]; content: string; name?: string; scene?: string }>
  loreLimit?: number
  situationImages: Array<{ keywords: string[]; image: string }>
  photoScenes?: CustomPhotoScene[]
  presetPersonas?: UserPersona[]
  personaGuide?: string
  personaRequired?: boolean
  /** 상태창·스탯(11/10, 크랙 INFO 블록) */
  statusFormat?: string
  stats?: CharacterStat[]
  /** 플레이 가이드·추천 첫 답변(11/10, 크랙 시작 설정) */
  playGuide?: string
  firstReplies?: string[]
  endings?: CharacterEnding[]
  recommendedModel: string; recommendedLength: 'short' | 'scene' | 'plus' | 'long' | 'saga'; recommendedThinking: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; adultOnly?: boolean
  /** 명령어(10/19) — 채팅에서 /이름 으로 부르는 한 턴 지시의 복사본. */
  commands: CharacterCommand[]
  /** 캐릭터 유형(10/19): 대화만 / 음성통화 / 음성+영상통화. */
  media: CharacterMedia
  /** 홈 남성향/여성향(10/20). */
  audience: 'female' | 'male'
  experienceType?: 'chat' | 'reality'
  isPublic: boolean
  /** 이미 저장된 사진 URL (편집 화면). 대표가 첫 번째. */
  images: string[]
}

/** 빈 폼. 숫자 기본값은 parse.ts 의 fallback 과 같아야 한다. */
export const EMPTY: FormInitial = {
  name: '', title: '', worldSetting: '', age: '', mbti: '', nationality: '', occupation: '',
  personality: '', hobbies: [], dislikes: [], mood: [], jealousy: 50, initiative: 50, emotionalExpression: 50,
  gender: 'male', build: 'average', height: '', detail: '', voiceId: '',
  eyes: '', nose: '', jaw: '', skin: '', distinctive: '',
  hairColor: '', hairLength: '', hairStyle: '', expression: '', styleTags: [],
  stage: 'stranger', trust: 30, attraction: 10, emotionalDistance: 60, attachment: 10, protectiveness: 20, relJealousy: 0, bonding: '',
  relationshipProfile: null, profileStatus: 'none',
  relationshipKeywords: [],
  contactEnabled: true, contactFrequency: 50, initiativeLevel: 50, replyDelayMinutes: 5,
  activeHoursStart: '08:00', activeHoursEnd: '23:00', preferredChannel: 'message',
  photoProbability: 20, voiceMessageProbability: 20, callProbability: 30, videoCallProbability: 10, senderLabel: '',
  startingContext: '', worldLocation: '', startingTime: '', sampleDialogue: [], lore: [], situationImages: [], recommendedModel: '', recommendedLength: 'scene', recommendedThinking: 'low', commands: [], media: 'text', audience: 'male',
  isPublic: true,
  images: [],
}

/**
 * 캐릭터 폼 — 만들기와 편집이 같은 화면이다 (명세서 2.2).
 * 탭은 보이기만 바꾼다 — 모든 칸이 DOM 에 남아 마지막에 한 번에 제출된다.
 * 등록 시 공개 여부를 선택할 수 있다. 임시저장은 항상 비공개다.
 */
type CharacterFormProps = {
  mode: 'create' | 'edit'
  experienceType: 'chat' | 'reality'
  creationId?: string
  userId?: string
  capabilities: ContactCapabilities & {characterVoice?:boolean}
  /** 운영자가 승인한 공식 목소리. 없으면 목소리 칸 자체를 보이지 않는다. */
  voices?: VoiceOption[]
  /** 권장 모델 후보(10/28) — 채팅에서 고를 수 있는 모델. */
  models?: Array<{ id: string; name: string }>
  draft?: boolean
  initial?: Partial<FormInitial>
  action: (form: FormData) => Promise<string>
  closeHref: string
}

export function CharacterForm(props: CharacterFormProps) {
  const { mode, userId, experienceType, creationId } = props
  const t = useT()
  const key = mode === 'create' && userId && creationId ? draftStorageKey(userId, experienceType, creationId) : null
  const [restored, setRestored] = useState<Partial<FormInitial> | null>(mode === 'edit' ? {} : null)
  useEffect(() => {
    if (!key || !userId || !creationId) return
    try {
      localStorage.setItem(activeDraftKey(userId, experienceType), creationId)
      const raw = localStorage.getItem(key)
      setRestored(raw ? restoreDraft(JSON.parse(raw) as Array<[string, string]>, experienceType) : {})
    } catch { setRestored({}) }
  }, [key, userId, creationId, experienceType])
  if (mode === 'create' && restored === null) return <main id="main" className="page"><p role="status" className="t-caption">{t('작성 중인 내용을 불러오는 중...')}</p></main>
  return <CharacterFormBody {...props} initial={mode === 'create' ? restored ?? {} : props.initial} storageKey={key} />
}

function CharacterFormBody({ mode, experienceType, creationId, userId, draft = false, initial, action, closeHref, capabilities, storageKey, voices = [], models = [] }: CharacterFormProps & { storageKey: string | null }) {
  const router = useRouter(), toast = useToast()
  const t = useT()
  const i: FormInitial = { ...EMPTY, ...initial }
  const [tab, setTab] = useState<CreateTab>('profile')
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 필수 판정에 쓰는 값만 통제한다. 나머지는 uncontrolled — 제출 때 FormData 가 모은다.
  const [name, setName] = useState(i.name)
  // 캐릭터 소개 한 칸(10/19) — 저장은 그대로 둘(tagline·personality)로 나뉜다: 첫 줄이 40자 이내이고 아래에 글이 더 있으면 첫 줄이 카드의 한 줄 소개.
  const [intro, setIntro] = useState(() => joinIntro(i.title, i.personality))
  const { title, personality } = splitIntro(intro)
  const [startingContext, setStartingContext] = useState(i.startingContext)
  const [mbti, setMbti] = useState<string>(i.mbti)
  const [gender, setGender] = useState<string>(i.gender)
  const [build] = useState<string>(i.build)
  const [voiceId, setVoiceId] = useState<string>(i.voiceId)
  // 작품 형식(11/10 사용자): 1:1 = 캐릭터 한 명, 다인 = 여러 인물이 나오고 인물마다 목소리를 고정한다.
  // 11/11 인물마다 사진·소개·성향·고급 설정까지(ensembleCast) — 예전 작품은 이름·목소리·사진만 있다.
  const [cast, setCast] = useState<CastMember[]>(() => Object.entries(i.ensembleVoices ?? {}).map(([name, voice]) => ({ ...i.ensembleCast?.find(p => p.name === name), name, voice, ...(i.ensemblePhotos?.[name] ? { photo: i.ensemblePhotos[name] } : {}) })))
  const [castMode, setCastMode] = useState<'single' | 'multi'>(cast.length ? 'multi' : 'single')
  const [advanced, setAdvanced] = useState(false)
  const [profileAdvanced, setProfileAdvanced] = useState(false)
  const [isPublic, setIsPublic] = useState(i.isPublic)
  const [media, setMedia] = useState<CharacterMedia>(i.media)
  const audience = i.audience
  const can = capabilities
  const [hobbies, setHobbies] = useState(i.hobbies)
  const [dislikes, setDislikes] = useState(i.dislikes)
  // 자동 채우기(10/19)가 넣은 값. uncontrolled 칸은 key 를 바꿔 다시 그리며 defaultValue 로 받는다 — 빈 칸에만 넣으므로 적은 값을 덮지 않는다.
  const [gen] = useState<Partial<Record<string, string>>>({})
  const [genTags] = useState<Partial<Record<'styleTags' | 'relationshipKeywords', string[]>>>({})
  const [genIntro] = useState<Array<{ role: 'character'; text: string; purpose: 'intro' }> | null>(null)
  const g = (k: keyof FormInitial & string) => ({ key: `${k}:${gen[k] ?? ''}`, defaultValue: gen[k] ?? String(i[k] ?? '') })
  const gt = (k: 'styleTags' | 'relationshipKeywords') => ({ key: `${k}:${(genTags[k] ?? []).join(',')}`, defaultValue: genTags[k] ?? i[k] })
  // 소개 페이지 미리보기 — 탭을 열 때 폼을 한 번 읽는다. 칸을 전부 controlled 로 바꾸지 않는다.
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!storageKey) return
    const form = formRef.current
    if (!form) return
    const save = () => {
      try { localStorage.setItem(storageKey, JSON.stringify(serializableDraft(form))) } catch { /* local storage may be unavailable */ }
    }
    const queueSave = () => requestAnimationFrame(save)
    form.addEventListener('input', queueSave)
    form.addEventListener('change', queueSave)
    form.addEventListener('click', queueSave)
    window.addEventListener('pagehide', save)
    return () => {
      form.removeEventListener('input', queueSave)
      form.removeEventListener('change', queueSave)
      form.removeEventListener('click', queueSave)
      window.removeEventListener('pagehide', save)
    }
  }, [storageKey])
  const [previewMode, setPreviewMode] = useState('detail')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const refreshSnap = () => { if (formRef.current) setSnap((prev) => { if (prev) [prev.photo, ...prev.gallery].forEach(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url) }); return snapshot(formRef.current!) }) }
  const openTab = (next: CreateTab) => {
    if (next === 'preview') refreshSnap()
    setTab(next)
  }
  // 데스크톱(10/28, 위프·베이비챗식): 왼쪽 폼 + 오른쪽 고정 미리보기. 미리보기는 탭이 아니라 늘 보이고, 고칠 때마다(0.6초 뒤) 새로 그린다.
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesktop(media.matches)
    on(); media.addEventListener('change', on)
    return () => media.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    const form = formRef.current
    if (!desktop || !form) return
    if (tab === 'preview') setTab('profile')
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = () => { clearTimeout(timer); timer = setTimeout(refreshSnap, 600) }
    refreshSnap()
    form.addEventListener('input', later); form.addEventListener('change', later)
    return () => { clearTimeout(timer); form.removeEventListener('input', later); form.removeEventListener('change', later) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop])

  // 게시가 잠긴 이유를 이름으로 보여 준다(10/19) — 어느 칸이 비었는지 탭을 뒤지지 않게.
  // 분류·설정 탭(10/28) — 장르 칸의 첫 값이 카테고리 목록에 있으면 카테고리, 나머지 장르와 관계 태그는 해시태그.
  const category = (CATEGORIES as readonly string[]).includes(i.mood[0] ?? '') ? i.mood[0]! : ''
  const initialHashtags = useMemo(() => [...i.mood.filter(m => m !== category), ...(genTags.relationshipKeywords ?? i.relationshipKeywords)].slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [])
  const [hashtags, setHashtags] = useState<string[]>(initialHashtags)
  const hashtagCount = hashtags.length
  const [adultOnly, setAdultOnly] = useState<'0' | '1'>(i.adultOnly ? '1' : '0')
  const [personaRequired, setPersonaRequired] = useState<'0' | '1'>(i.personaRequired ? '1' : '0')
  const [recModel, setRecModel] = useState(i.recommendedModel ?? '')
  const [recLength, setRecLength] = useState<'short' | 'scene' | 'plus' | 'long' | 'saga'>(i.recommendedLength ?? 'scene')
  const [recThinking, setRecThinking] = useState<string>(i.recommendedThinking ?? 'low')
  const missing = useMemo(() => [
    [!name.trim(), msg('이름')], [!personality.trim(), msg('캐릭터 소개')], [castMode === 'multi' && cast.some(c => !c.name.trim() || !c.intro?.trim()), msg('추가한 캐릭터의 이름·소개')], [!startingContext.trim(), msg('첫 장면')], [hashtagCount === 0, msg('해시태그')],
  ].filter(([empty]) => empty).map(([, label]) => label as string), [name, personality, startingContext, hashtagCount, castMode, cast])
  const canSubmit = missing.length === 0
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pendingRef.current) return
    pendingRef.current = true
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const form = submitter instanceof HTMLButtonElement
      ? new FormData(event.currentTarget, submitter)
      : new FormData(event.currentTarget)
    const submittedDraft = storageKey ? JSON.stringify(serializableDraft(event.currentTarget)) : null
    setPending(true)
    setSaveError('')
    try {
      const destination = await action(form)
      if (storageKey) {
        try {
          const currentDraft = localStorage.getItem(storageKey)
          if (currentDraft === submittedDraft || currentDraft === null) localStorage.removeItem(storageKey)
        } catch { /* Storage may be unavailable. The saved record is authoritative. */ }
      }
      // Publishing a saved draft also finishes the draft resumed by the navigation sheet.
      if (form.get('intent') !== 'draft' && userId && creationId) {
        try {
          if (localStorage.getItem(activeDraftKey(userId, experienceType)) === creationId) {
            localStorage.removeItem(activeDraftKey(userId, experienceType))
          }
        } catch { /* Storage may be unavailable. The saved record is authoritative. */ }
      }
      // 11/10 사용자: 끝나면 토스트 — 임시 저장·편집은 '저장되었습니다.', 새로 만들면 '성공적으로 생성되었습니다.' (토스트는 앱 전체에 걸려 있어 이동해도 보인다)
      toast(mode === 'create' && form.get('intent') !== 'draft' ? msg('성공적으로 생성되었습니다.') : msg('저장되었습니다.'))
      if (mountedRef.current) router.push(destination)
    } catch {
      if (mountedRef.current) setSaveError(msg('저장하지 못했어요. 작성한 내용은 이 화면에 남아 있습니다. 다시 시도해 주세요.'))
    } finally {
      pendingRef.current = false
      if (mountedRef.current) setPending(false)
    }
  }


  return (
    // Page 는 transform 을 걸어 sticky 를 깨뜨리므로 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page create-page" style={{ paddingTop: 0, ...(mode === 'create' ? { paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))' } : {}), outline: 'none' }}>
      <form ref={formRef} onSubmit={submit} className="stack" style={{ gap: 0 }}>

        <CreateHeader tab={tab} onTab={openTab} experienceType={experienceType} canSubmit={canSubmit} canDraft={!!name.trim()} pending={pending}
          missingHint={canSubmit ? (isPublic ? t('공개 게시') : t('나만 보기')) : t('아직 필요: {items}', { items: missing.map(label => t(label)).join(' · ') })}
          buttons={mode === 'edit' && !draft ? 'save' : 'create'} closeHref={closeHref} />
        {saveError && <p role="alert" className="t-caption" style={{ padding: '8px var(--gutter)', color: 'var(--color-danger)' }}>{t(saveError)}</p>}
        {mode === 'create' && experienceType === 'reality' && <CreateTour tab={tab} onTab={openTab} />}

        <input type="hidden" name="experienceType" value={experienceType} />
        {mode === 'create' && <input type="hidden" name="creationId" value={creationId ?? ''} />}

        <input type="hidden" name="hobbies" value={hobbies.join(',')} />
        <input type="hidden" name="dislikes" value={dislikes.join(',')} />
        {/* ── 프로필 ── */}
        <Panel id="profile" show={tab === 'profile'}>
          {/* 유형(10/19): 몰입 모드 = 채팅을 목소리로 듣고 말로 이어 가는 모드(통화 아님). 재생은 chat/[sessionId]/immersive.tsx.
              10/31 사용자: 음성 / 음성+영상 두 갈래를 '몰입 모드' 하나로 — 고르면 'video'(사진이 화면 전체). 예전에 'voice'로 저장된 캐릭터도 몰입 모드로 보이고, 고쳐 저장할 때까지 값은 그대로. */}
          {/* 11/12 사용자: 음성 관련 칸은 숨긴다 — 저장값(media)은 그대로 제출된다. */}
          {can.characterVoice&&experienceType === 'reality' && <div hidden><Section title={t('유형')} subtitle={t('더빙은 이 캐릭터와의 채팅을 목소리로 듣고 말로 이어 가는 모드예요. 캐릭터 사진이 화면 전체에 깔려요.')}>
            <Card>
              <input type="hidden" name="media" value={media} />
              <ChoiceChips value={media === 'text' ? 'text' : 'video'} onChange={v => setMedia(v === 'text' ? 'text' : media === 'text' ? 'video' : media)} columns={2}
                options={[{ value: 'text', label: t('대화') }, { value: 'video', label: t('더빙') }]} />
            </Card>
          </Section></div>}
          {/* 대상(10/28): 고르는 칸은 지웠다(사용자 요청). 저장된 값은 그대로 보낸다. */}
          <input type="hidden" name="audience" value={audience} />
          <Section title={t('작품 형식')} subtitle={t('다인은 여러 인물이 함께 나오는 작품이에요. 아래 캐릭터 칸 밑의 \'캐릭터 추가\'로 인물을 더할 수 있어요.')}>
            <Card>
              <input type="hidden" name="ensembleVoices" value={castMode === 'multi' ? castJson(cast) : '{}'} />
              <input type="hidden" name="ensemblePhotos" value={castMode === 'multi' ? castPhotosJson(cast) : '{}'} />
              <input type="hidden" name="ensembleCast" value={castMode === 'multi' ? castProfilesJson(cast) : '[]'} />
              <Segmented value={castMode} onChange={setCastMode}
                options={[{ value: 'single', label: t('1:1'), hint: t('캐릭터 한 명') }, { value: 'multi', label: t('다인'), hint: t('여러 인물') }]} />
            </Card>
          </Section>
          <Section title={t('공개')}>
            <Card>
              <Switch name="isPublic" checked={isPublic} onChange={setIsPublic}
                label={t('다른 사람에게 공개')}
                hint={t('게시할 때 켜져 있으면 홈과 검색에 실리고, 누구나 이 캐릭터와 대화를 시작할 수 있습니다.')} />
            </Card>
          </Section>
          <Section title={t('캐릭터')}>
            <Card>
              <ImagePicker label={t('캐릭터 이미지')} maxCount={5} existing={i.images} />
              <div style={{ marginTop: 'var(--space-5)' }}>
                <IdentityCard>
                  <div className="stack" style={{ gap: 18 }}>
                    <LabeledField label={t('이름')} required error={name === '' ? null : undefined}>
                      <Controlled name="name" label={t('이름')} max={10} value={name} onChange={setName} big />
                    </LabeledField>
                    {/* 소개(한 줄)와 성격 설명을 한 칸으로(10/19). 서버 칸 이름은 그대로 — 첫 줄이 title, 나머지가 personality. */}
                    <input type="hidden" name="title" value={title} />
                    <input type="hidden" name="personality" value={personality} />
                    <LabeledField label={t('캐릭터 소개')} required hint={t('첫 줄은 카드에 걸리는 한 줄 소개가 돼요(40자). 그 아래에 외모·성격·말투·가치관·비밀·배경 이야기를 자유롭게 적어 주세요. AI는 여기 적힌 대로 연기해요.')}>
                      <ControlledArea name="characterIntro" label={t('캐릭터 소개')} value={intro} onChange={setIntro} max={5040} rows={10} />
                    </LabeledField>
                    {experienceType === 'reality' && <ReactionTraits initial={i} />}
                  </div>
                </IdentityCard>
              </div>
              {/* 나이·MBTI·국적·직업은 고급 — 이름과 소개만으로 카드가 된다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={profileAdvanced} onToggle={() => setProfileAdvanced((v) => !v)} controls="profile-advanced" />
              <div id="profile-advanced" hidden={!profileAdvanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <LabeledField label={t('나이')}><CountedInput name="age" max={10} {...g('age')} /></LabeledField>
                  <LabeledField label="MBTI">
                    <ChoiceChips name="mbti" value={mbti} onChange={setMbti} columns={4}
                      options={[{ value: '', label: t('선택 안 함') }, ...MBTI_TYPES.map((m) => ({ value: m, label: m }))]} />
                  </LabeledField>
                  <Two>
                    <LabeledField label={t('국적')}><CountedInput name="nationality" max={40} {...g('nationality')} /></LabeledField>
                    <LabeledField label={t('직업')}><CountedInput name="occupation" max={60} {...g('occupation')} /></LabeledField>
                  </Two>
                </div>
              </div>
            </Card>
          </Section>
          {/* 11/11 다인: 주인공 칸 아래로 같은 모양의 캐릭터 칸을 버튼으로 하나씩 더한다. */}
          {castMode === 'multi' && <CastProfiles cast={cast} onChange={setCast}
            heading={(index, body) => <Section title={t('캐릭터 {n}', { n: index + 2 })}><IdentityCard>{body}</IdentityCard></Section>} />}

        </Panel>

        {/* ── 세계관 ── */}
        <Panel id="personality" show={tab === 'personality'}>
          <Section title={t('세계관')}>
            <Card>
              <LabeledField label="" hint={experienceType === 'chat' ? t('대화에 반영되며 공개 소개에는 표시되지 않아요.') : t('캐릭터가 살아가는 시대, 장소, 배경을 적어 주세요.')}>
                <CountedTextArea name="worldSetting" ariaLabel={t('세계관 설명')} max={600} rows={4} {...g('worldSetting')}
                  placeholder={t('예) 현대 서울. 도심의 경호업체를 중심으로 다양한 사건이 벌어진다.')} />
              </LabeledField>
            </Card>
          </Section>
          {/* 전개 예시(11/10, 크랙 스토리 설정) — 10/28 사용자 요청으로 화면에서 뺐던 상황 예시를 고급 설정 안에 접어서 되살렸다. 이미 적힌 예시는 그대로 이어받는다. */}
          <details className="create-advanced">
            <summary>{t('고급 설정 · 전개 예시')}</summary>
            <Section title={t('전개 예시 · 선택')} subtitle={t('유저가 이렇게 말하면 캐릭터는 이렇게 답한다는 예시예요. 최대 3쌍. AI가 말투와 분량의 기준으로 삼아요.')}>
              <ExamplesEditor defaultValue={sampleDialogue(i.sampleDialogue)} characterName={name} />
            </Section>
          </details>

        </Panel>

        {/* ── 명령어(10/19, 외형 자리) — 채팅에서 /이름 으로 부르는 한 턴 지시. 라이브러리에서 골라 붙이거나 직접 만들어 공개한다. ── */}
        <Panel id="commands" show={tab === 'commands'}>
          <Section title={t('명령어')} subtitle={t('대화 중 /이름 으로 불러 쓰는 한 턴 지시예요. 다른 사람이 공개한 것을 그대로 붙이거나, 직접 만들어 공개할 수 있어요.')}>
            <Card>
              <CommandEditor name="commands" defaultValue={i.commands} />
            </Card>
          </Section>
        </Panel>

        {/* ── 로어북(11/12 연결) — 전엔 숨은 칸이 저장값만 되돌려 보내 새 캐릭터는 늘 비어 있었다. 탭이 닫혀 있어도 DOM 에 남아 제출된다. ── */}
        <Panel id="lore" show={tab === 'lore'}>
          <Section title={t('설정집 · 선택')} subtitle={t('세계관이나 인물·장소 설정을 적어 두면, 대화에 그 키워드가 나온 턴에만 AI에게 전달돼요. 키워드를 비우면 항상 전달돼요.')}>
            <LoreEditor name="lore" defaultValue={i.lore} defaultLimit={i.loreLimit ?? 6} scenes={introScenes(i.sampleDialogue).slice(1)} />
          </Section>
        </Panel>

        {/* ── 외형 — 관계 탭 안에 함께 보인다(10/19). DOM 은 앞이지만 order 로 관계 내용 아래에 놓는다. ── */}
        <Panel id="relationship-visual" show={tab === 'relationship'} order={1}>
          {/* 11/12 외형 칸 전부 삭제(사용자: 외형은 소개 글에 적는다) — AI 와 사진 생성 모두 소개 글의 묘사를 따른다. */}
          {!can.characterVoice&&<input type="hidden" name="media" value={media}/>}
        </Panel>

        {/* ── 관계 ── */}
        {/* 관계 탭 — 관계 태그는 캐릭터챗도 고른다(2026-09-30). 시작 관계·관계 성격은 미로 캐릭터만. */}
        <Panel id="relationship" show={tab === 'relationship'}>
          {/* 관계 성격표 편집(ProfileSettings)과 세부 감정 6개는 10/19 화면에서 뺐다 — 저장 때 AI 가 만든 표와 프리셋 값이 그대로 쓰인다. 일상·연락도 이 탭으로 합쳤다. */}
          {experienceType === 'reality' && <>
          <Section title={t('시작 관계')}>
            <RelationshipSettings initial={i} />
          </Section>
          {/* 10/28: '일상·연락' 제목은 지웠다(사용자 요청). */}
          <section aria-label={t('일상·연락')} style={{ marginTop: 'var(--space-6)' }}>
            <ContactSettings initial={i} mode={mode} capabilities={capabilities} />
          </section>
          </>}
        </Panel>

        {/* ── 인트로 — 다른 탭과 같은 자리에 펼친다(10/19, 전에는 전체 화면이라 필수인 첫 장면과 게시 버튼이 서로 가려졌다). 칸은 닫혀도 DOM 에 남는다. ── */}
        <Panel id="intro" show={tab === 'intro'}>
          <Section title={t('첫 장면')}>
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label={t('첫 장면')} required hint={t('대화가 시작되는 배경이에요. 아래 인트로는 새 채팅에 실제 메시지로 표시됩니다.')}>
                  <ControlledArea name="startingContext" label={t('첫 장면')} value={startingContext} onChange={setStartingContext} max={600} rows={3}
                    placeholder={t('비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다.')} />
                </LabeledField>
                {/* 첫 장면의 장소 — 비우면 세계는 '어딘가' 에서 시작한다(9/27 운영 실측에서 장면 표시가 "어딘가 · 저녁" 이었다). */}
                <LabeledField label={t('장소')} hint={t('첫 장면이 펼쳐지는 곳이에요. 채팅의 장면 표시와 소개 페이지에 보여요.')}>
                  <CountedInput name="worldLocation" ariaLabel={t('장소')} placeholder={t('예) 서울, 경호업체 사무실')} max={60} {...g('worldLocation')} />
                </LabeledField>
              </div>
            </Card>
          </Section>
          <input type="hidden" name="startingTime" value={gen.startingTime ?? i.startingTime} />
        </Panel>
        {/* 인트로 대화(10/28) — 화자를 고르고 한 마디씩 쌓는 채팅식 편집기. 데스크톱에선 인트로 탭일 때 미리보기 자리(오른쪽)에 뜬다. */}
        {/* 준비된 페르소나(11/3) — 대화 시작 화면에서 사용자가 골라 쓰는 '나'. 비워 두면 사용자가 직접 적는다. */}
        <Panel id="preset-personas" show={tab === 'intro'}>
          {/* 페르소나 필수(11/6) — 필수면 첫 대화 전 세계관 카드에서 '나'를 정해야 시작, 아니면 바로 시작. */}
          <Section title={t('대화 전 페르소나')} subtitle={t('필수로 두면 사용자는 첫 대화 전에 이 세계에서의 나를 정해야 시작할 수 있어요. 선택이면 바로 대화를 시작해요.')}>
            <Segmented name="personaRequired" value={personaRequired} onChange={setPersonaRequired} options={[{ value: '0', label: t('선택') }, { value: '1', label: t('필수') }]} />
          </Section>
          {/* 페르소나 작성 안내(11/4) — 첫 대화 전 세계관 카드에서 사용자가 '이 세계에서의 나'를 쓸 때 보이는 안내. */}
          <Section title={t('페르소나 작성 안내 · 선택')} subtitle={t('첫 대화 전에 사용자는 세계관을 읽고 이 세계에서의 자기 자신을 직접 적어요. 무엇을 적으면 좋을지 알려 주세요.')}>
            <CountedTextArea name="personaGuide" ariaLabel={t('페르소나 작성 안내')} max={300} rows={3} defaultValue={i.personaGuide ?? ''}
              placeholder={t('예) 당신은 어떤 헌터인가요? 이름, 원래 등급, 능력, 지금 처지를 적어 주세요.')} />
          </Section>
          <Section title={t('준비된 페르소나 · 선택')} subtitle={t('대화를 시작할 때 사용자가 고를 수 있는 \'나\'예요. 고른 뒤에 고쳐 쓸 수도 있어요.')}>
            <PresetPersonasEditor defaultValue={i.presetPersonas ?? []} />
          </Section>
          {/* 플레이 가이드·추천 첫 답변(11/10, 크랙 시작 설정) — 둘 다 사용자 화면에만 보이고 AI 에는 가지 않는다. */}
          <Section title={t('플레이 가이드 · 선택')} subtitle={t('첫 화면에 사용자에게만 보이는 안내예요. AI는 이 글을 읽지 않아요. 어떻게 놀면 좋은지 알려 주세요.')}>
            <CountedTextArea name="playGuide" ariaLabel={t('플레이 가이드')} max={500} rows={3} defaultValue={i.playGuide ?? ''}
              placeholder={t('예) 매일 해 질 녘에 습격이 와요. 죽으면 같은 날 아침으로 돌아가니, 무엇이 달라졌는지 살펴보세요.')} />
          </Section>
          <Section title={t('추천 첫 답변 · 선택')} subtitle={t('첫 대화에서 입력창 위에 미리 떠 있는 답이에요. 최대 3개, 행동은 *별표* 로 감싸요.')}>
            <div className="stack" style={{ gap: 8 }}>
              {[0, 1, 2].map(n => <CountedInput key={n} name="firstReplies" ariaLabel={t('추천 첫 답변 {n}', { n: n + 1 })} max={80}
                placeholder={[t('예) *주위를 둘러본다* 여기가… 어디지?'), t('예) 오늘은 정말 일찍 퇴근할 거예요.'), t('예) 처음 뵙겠습니다.')][n]} defaultValue={i.firstReplies?.[n] ?? ''} />)}
            </div>
          </Section>
        </Panel>
        <Panel id="intro-dialogue" show={tab === 'intro'}>
          <Section title={t('인트로 대화')} subtitle={t('새 채팅이 열릴 때 캐릭터가 먼저 건네는 말이에요. 비워 두면 사용자가 먼저 말을 걸어요.')}>
            <div className="create-intro-editor">
              <DialogueEditor intro fill name="introDialogue" characterName={name} defaultValue={genIntro ?? introDialogue(i.sampleDialogue)} />
            </div>
          </Section>
          {/* 시작 설정 추가(11/10, 크랙) — 첫 장면 말고 다른 시작 상황. 사용자는 소개 페이지에서 고른다. */}
          <details className="create-advanced" open={introScenes(i.sampleDialogue).length > 1}>
            <summary>{t('시작 설정 추가 · 선택')}</summary>
            <ExtraScenesEditor characterName={name} defaultValue={introScenes(i.sampleDialogue).slice(1).map(scene => ({ scene, lines: introDialogue(i.sampleDialogue, scene), ...sceneMeta(i.sampleDialogue, scene) }))} />
          </details>
        </Panel>

        {/* ── 상태창·스탯(11/10, 크랙 INFO 블록) — 비워 두면 상태창 없이 지금처럼 대화한다. ── */}
        <Panel id="status" show={tab === 'status'}>
          <Section title={t('상태창 · 선택')} subtitle={t('매 답변 끝에 붙는 상태 정보의 틀이에요. 날짜·장소·스탯·아이템처럼 이야기가 어디까지 왔는지 보여 줘요. 대화 화면에선 접었다 펼 수 있는 카드로 나와요.')}>
            <StatusEditor defaultFormat={i.statusFormat ?? ''} defaultStats={i.stats ?? []} defaultIntroStatus={(introDialogue(i.sampleDialogue) as Array<{ status?: string }>).find(e => e.status)?.status ?? ''} />
          </Section>
        </Panel>
        {/* ── 엔딩(11/10, 크랙 엔딩 설정) — 비워 두면 엔딩 없이 이어진다. ── */}
        <Panel id="endings" show={tab === 'endings'}>
          <Section title={t('엔딩 · 선택')} subtitle={t('최소 턴이 지나고 조건이 이야기 속에서 이뤄지면 엔딩 카드가 떠요. 등급을 달고 힌트를 남기면 사용자가 다른 엔딩도 모으고 싶어져요.')}>
            <EndingsEditor defaultValue={i.endings ?? []} />
          </Section>
        </Panel>

        {/* ── 상황별 사진(10/28) — 인트로 옆 탭 ── */}
        {/* 10/28: 목소리는 캐릭터와 따로 — 만들어 둔 음성(내 음성·공식) 중에서 고른다. 음성은 '나 → 내 캐릭터 → 음성' 에서 만든다. */}
        <Panel id="voice" show={tab === 'voice'}>
          <Section title={t('목소리')}>
            {/* 기본 목소리(지환)는 늘 있으니 목록은 늘 보인다 */}
            <VoiceList voices={voices} value={voiceId} onChange={setVoiceId} />
            {castMode === 'multi' && <div style={{ marginTop: 'var(--space-5)' }}>
              <p className="t-caption" style={{ margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>{t('위 목소리는 주인공·내레이션 목소리예요. 아래에서 등장인물마다 목소리를 고정하세요. 같은 목소리를 여러 인물에 써도 돼요.')}</p>
              <CastVoices cast={cast} voices={voices} onChange={setCast} />
            </div>}
            <TransitionLink href="/my/voices" className="t-caption" style={{ display: 'inline-block', marginTop: 16, color: 'var(--color-lavender-200)' }}>{t('내 음성 만들기')} →</TransitionLink>
          </Section>
        </Panel>
        <Panel id="situations" show={tab === 'situations'}>
          {/* 상황별 사진(10/28, 위프·베이비챗식) — 사진마다 상황을 적어 두면 대화가 그 상황이 됐을 때 AI 가 골라 채팅에 띄운다(10/31). */}
          <Section title={t('상황별 사진 · 선택')} subtitle={t('사진마다 어떤 상황인지 적어 두면, 대화가 그 상황이 됐을 때 AI가 알아서 채팅에 띄워요.')}>
            <SituationImagesEditor defaultValue={i.situationImages ?? []} />
          </Section>
          {/* 사진 장면(11/3) — 채팅 사진 버튼의 기본 장면 뒤에 이 캐릭터만의 장면을 붙인다. */}
          <Section title={t('사진 장면 · 선택')} subtitle={t('채팅에서 사진을 만들 때 고를 수 있는 이 캐릭터만의 장면이에요. 장면을 글로 적으면 그대로 그려요.')}>
            <PhotoScenesEditor defaultValue={i.photoScenes ?? []} />
          </Section>
        </Panel>

        {/* ── 분류·설정(10/28) — 카테고리 하나 + 해시태그(장르·관계를 한곳에서). 저장 때 parse 가 예전 장르·관계 태그 칸으로 나눈다. ── */}
        <Panel id="settings" show={tab === 'settings'}>
          {/* 10/28: 카테고리 칸은 화면에서 지웠다(사용자 요청) — 저장값은 그대로 보낸다. */}
          <input type="hidden" name="category" value={category} />
          <Section title={t('해시태그')}>
            {/* 10/28: 접는 버튼 없이 바로 펼쳐 둔다(사용자 요청). */}
            <PresetTags name="hashtags" label={msg('해시태그')} max={10} defaultValue={initialHashtags} onChange={setHashtags}
              groups={DISCOVERY_GROUPS.map(g => ({ label: g.title, options: g.tags }))} />
          </Section>
          {/* 이용 대상(10/28) — 언베일 전용이면 언베일을 켠 사람의 홈·탐색에만 나온다. */}
          <Section title={t('이용 대상')}>
            <Segmented name="adultOnly" value={adultOnly} onChange={setAdultOnly} options={[{ value: '0', label: t('모두') }, { value: '1', label: t('언베일 전용'), unveil: true }]} />
          </Section>
          <Section title={t('대화 기본값')}>
            <div style={{ display: 'grid', gap: 24, padding: 16, borderRadius: 16, border: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-lavender-300) 4%, transparent)' }}>
              <div>
                <p className="t-body" style={{ fontWeight: 'var(--weight-medium)', marginBottom: 8 }}>{t('권장 모델')}</p>
                <SelectField name="recommendedModel" value={recModel} onChange={setRecModel} options={[{ value: '', label: t('기본 (서버 추천)') }, ...models.map(m => ({ value: m.id, label: m.name }))]} />
              </div>
              <div>
                <p className="t-body" style={{ fontWeight: 'var(--weight-medium)', marginBottom: 4 }}>{t('출력량')}</p>
                <StepSlider name="recommendedLength" label={t('출력량')} value={recLength} onChange={v => setRecLength(v as 'short' | 'scene' | 'plus' | 'long' | 'saga')}
                  steps={[{ value: 'short', label: t('짧은 장면') }, { value: 'scene', label: t('보통 장면') }, { value: 'plus', label: t('조금 긴 장면') }, { value: 'long', label: t('긴 장면') }, { value: 'saga', label: t('아주 긴 장면') }]} />
              </div>
              <div>
                <p className="t-body" style={{ fontWeight: 'var(--weight-medium)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t('생각')}<span className="t-micro" style={{ padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-lavender-300) 18%, transparent)', color: 'var(--color-lavender-200)', letterSpacing: 0 }}>BETA</span>
                </p>
                <StepSlider name="recommendedThinking" label={t('생각')} value={recThinking} onChange={setRecThinking}
                  steps={[{ value: 'low', label: t('빠름') }, { value: 'medium', label: t('가볍게') }, { value: 'high', label: t('보통') }, { value: 'xhigh', label: t('깊게') }, { value: 'max', label: t('최대') }]} />
              </div>
            </div>
          </Section>
        </Panel>

        {/* ── 소개 페이지 ── */}
        {tab !== 'preview' && <StepNav tab={tab} onTab={openTab} />}
        <Panel id="preview" show={tab === 'preview' || (desktop && tab !== 'intro')}>
          <div style={{ marginTop: 20 }}><ChoiceChips value={previewMode} onChange={setPreviewMode} options={[{ value: 'detail', label: t('소개 페이지') }, { value: 'chat', label: t('테스트 채팅') }]} /></div>
          {/* 테스트 채팅(10/19) — 미리보기를 연 시점의 인트로를 깔고, 보낼 때마다 폼을 다시 읽어 지금 설정으로 답한다. */}
          {previewMode === 'detail' ? <DetailPreview d={snap} can={can} experienceType={experienceType} />
            : snap && <TestChat key={snap.name} form={() => formRef.current} name={snap.name}
                intro={introDialogue(snap.settings.character.sampleDialogue).map(turn => ({ role: turn.role as 'character' | 'narrator', text: turn.text }))} />}
        </Panel>

      </form>
    </main>
  )
}

/** 캐릭터 소개 한 칸 ↔ 저장 칸 둘(tagline 40자 + personality). 둘 다 있고 다르면 줄바꿈으로 잇는다. */
function joinIntro(title: string, personality: string): string {
  return title && personality && personality !== title ? `${title}\n${personality}` : personality || title
}
/** 첫 줄이 40자 이내이고 아래에 글이 더 있으면 첫 줄이 한 줄 소개, 나머지가 성격. 아니면 글 전체가 성격이고 소개는 첫 줄 앞 40자. */
function splitIntro(text: string): { title: string; personality: string } {
  const whole = text.trim()
  const nl = whole.indexOf('\n')
  const first = (nl === -1 ? whole : whole.slice(0, nl)).trim()
  const rest = nl === -1 ? '' : whole.slice(nl + 1).trim()
  if (first.length <= 40 && rest) return { title: first, personality: rest.slice(0, 5000) }
  return { title: first.slice(0, 40), personality: whole.slice(0, 5000) }
}

/** 탭 패널. 감춰도 DOM 에 남긴다 — 값이 살아 있어야 한 번에 제출된다. order 로 같은 탭의 두 패널 순서를 정한다. */
function Panel({ id, show, order, children }: { id: string; show: boolean; order?: number; children: React.ReactNode }) {
  return <div id={`panel-${id}`} role="tabpanel" hidden={!show} inert={!show} style={order === undefined ? undefined : { order }}>{children}</div>
}

/** 섹션 — 제목은 카드 바깥. */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <h2 className="t-title-3" style={{ marginBottom: subtitle ? 4 : 12 }}>{title}</h2>
      {subtitle && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </section>
  )
}

/** 섹션의 칸 묶음. 판(배경)은 두지 않는다 — 입력칸과 버튼이 각자 면을 갖고 있어 페이지 바닥 위에 바로 놓인다. */
function Card({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

/** 이름·소개·설명만 따로 묶는 판 — 카드의 핵심 정보라 다른 필드와 시각적으로 구분한다. 만들기 화면에선 바탕색에 테두리만(베이비챗 식 층). */
function IdentityCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>{children}</div>
}

/** '고급 설정' 접기 버튼 — 카드 아래 전체 너비. 열리면 화살표가 뒤집힌다. 접힌 내용은 hidden 으로만 감춰 제출에 포함된다. */
function AdvancedToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  const t = useT()
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
        minHeight: 52, marginTop: 'var(--space-5)', padding: '14px 16px', borderRadius: 'var(--radius-button)',
        background: 'var(--color-surface-3)', border: 0, cursor: 'pointer',
        color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)',
      }}>
      {t('고급 설정')}
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--motion-fast) var(--ease-standard)' }}>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/** 좌우 두 칸. 1fr 은 최소 폭이 입력 고유 폭에 잡혀 오른쪽 칸이 카드를 넘친다 — minmax(0,1fr) 로 눌러야 한다. */
function Two({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>{children}</div>
}

/** 값을 바깥이 들고 있는 한 줄 입력 (필수 판정용). 밑줄만, 상자 없음. */
function Controlled({ name, label, placeholder, max, value, onChange, big }: {
  name: string; label: string; placeholder?: string; max: number; value: string; onChange: (v: string) => void; big?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: fieldPad, ...box(focused) }}>
      <input name={name} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont }} />
      {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
    </div>
  )
}

function ControlledArea({ name, label, placeholder, max, rows, value, onChange }: {
  name: string; label: string; placeholder?: string; max: number; rows: number; value: string; onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: fieldPad, paddingBottom: 'var(--field-pad-b, 3px)', ...box(focused) }}>
      <textarea name={name} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont, lineHeight: 1.5, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 14 }}>
        {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
      </div>
    </div>
  )
}

/** 성별 — 글자 칩에서 고른다(10/8: 체형 사진 삭제, 10/19: 체형 선택 삭제). */
function BodyPicker({ gender, onGender }: { gender: string; onGender: (g: string) => void }) {
  const t = useT()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>{t('성별')}</legend>
      <ChoiceChips name="gender" value={gender} onChange={onGender} columns={2}
        options={GENDER_TYPES.map((g) => ({ value: g, label: t(GENDER_PRESETS[g].label) }))} />
    </fieldset>
  )
}

const REACTION_TRAITS = [
  { name: 'jealousy', label: msg('질투'), choices: [msg('적음'), msg('보통'), msg('많음')], summaries: [msg('질투 적음'), msg('질투 보통'), msg('질투 많음')] },
  { name: 'initiative', label: msg('다가가는 방식'), choices: [msg('기다림'), msg('상황에 따라'), msg('먼저')], summaries: [msg('수동'), msg('유연'), msg('주도')] },
  { name: 'emotionalExpression', label: msg('감정 표현'), choices: [msg('절제함'), msg('적당히'), msg('솔직함')], summaries: [msg('표현 절제'), msg('표현 보통'), msg('표현 솔직')] },
] as const

function ReactionTraits({ initial }: { initial: FormInitial }) {
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState<string[]>([])
  const t = useT()
  const reduceMotion = useReducedMotion()
  // Keep exact saved values until the user explicitly chooses a new level.
  const [values, setValues] = useState(() => ({
    jealousy: initial.jealousy,
    initiative: initial.initiative,
    emotionalExpression: initial.emotionalExpression,
  }))
  const level = (value: number) => value < 34 ? 0 : value > 66 ? 2 : 1
  const balanced = REACTION_TRAITS.every(({ name }) => level(values[name]) === 1)
  const summary = balanced ? t('균형') : REACTION_TRAITS.map(({ name, summaries }) => t(summaries[level(values[name])]!)).join(' · ')
  return (
    <div className="stack" style={{ gap: 12, paddingTop: 20 }}>
      {REACTION_TRAITS.map(({ name }) => <input key={name} type="hidden" name={name} value={values[name]} />)}
      {touched.map(name => <input key={name} type="hidden" name="agencyExplicitField" value={`personality.${name}`} />)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="t-body" style={{ flex: 1, minWidth: 0, fontWeight: 'var(--weight-semibold)' }}>{t('반응 성향')}</span>
        <motion.button whileTap={reduceMotion ? undefined : { scale: 0.9 }} transition={{ type: 'spring', stiffness: 450, damping: 25 }} type="button" aria-label={open ? t('반응 성향 편집 접기') : t('반응 성향 편집')} aria-expanded={open} aria-controls="reaction-traits" onClick={() => setOpen((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 4, border: 0, borderRadius: 'var(--radius-sm)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 3 5 5M4 20l4.5-1L21 6.5a2.12 2.12 0 0 0-3-3L5.5 16 4 20Z" />
          </svg>
        </motion.button>
      </div>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: -8 }}>{summary}</p>
      <div id="reaction-traits" hidden={!open}>
        <div className="stack" style={{ gap: 16 }}>
          {REACTION_TRAITS.map(({ name, label, choices }) => (
            <fieldset key={name} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend className="t-body" style={{ marginBottom: 8, fontWeight: 'var(--weight-semibold)' }}>{t(label)}</legend>
              <ChoiceChips columns={3} value={String(level(values[name]))}
                options={choices.map((choice, index) => ({ value: String(index), label: t(choice) }))}
                onChange={(value) => {
                  setTouched(previous => previous.includes(name) ? previous : [...previous, name])
                  setValues((previous) => ({ ...previous, [name]: [20, 50, 80][Number(value)] }))
                }} />
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 시작 설정의 장면 정보 — 그 장면 줄 가운데 시작 상황·시각·장소가 적힌 첫 줄에서(시드가 넣은 값). */
function sceneMeta(entries: FormInitial['sampleDialogue'], scene: string) {
  const hit = (entries as Array<FormInitial['sampleDialogue'][number] & { scene?: string; context?: string; time?: string; location?: string; status?: string }>)
    .find(t => t.purpose === 'intro' && t.scene === scene && (t.context || t.time || t.location || t.status))
  return hit ? { context: hit.context, time: hit.time, location: hit.location, status: hit.status } : {}
}
