'use client'
import { introDialogue, sampleDialogue } from '@/lib/intro-dialogue'
import { ContactSettings, RelationshipSettings } from './creation-settings'
import type { ProfileStatus } from './profile-settings'
import type { RelationshipProfile } from '@miro/domain'
import type { ContactCapabilities } from '@/lib/reality/channels'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import { GENDER_PRESETS, GENDER_TYPES } from '@miro/domain'
import { CreateHeader, type CreateTab } from './header'
import { CreateTour } from './tour'
import { DetailPreview, snapshot, type Snapshot } from './preview'
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, LabeledField, PresetTags, Switch, TagInput, box, fieldFont, fieldPad, type Step } from './form-parts'
import { SituationImagesEditor } from './situation-images-editor'
import { MOODS } from './parse'
import { TestChat } from './test-chat'
import { CommandEditor } from './command-editor'
import type { CharacterCommand } from '@miro/db'
import type { CharacterMedia } from '@miro/config'
import { RELATIONS } from '@/lib/genres'
import { activeDraftKey, draftStorageKey, restoreDraft, serializableDraft } from './draft-storage'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const
export type FormInitial = {
  name: string; title: string; worldSetting: string; age: string; mbti: string; nationality: string; occupation: string
  personality: string; hobbies: string[]; dislikes: string[]; mood: string[]; jealousy: number; initiative: number; emotionalExpression: number
  gender: string; build: string; height: string; detail: string
  /** 공식 목소리 ID. '' 이면 기본 목소리. */
  voiceId: string
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
  lore: Array<{ keywords: string[]; content: string }>
  situationImages: Array<{ keywords: string[]; image: string }>
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
  startingContext: '', worldLocation: '', startingTime: '', sampleDialogue: [], lore: [], situationImages: [], commands: [], media: 'text', audience: 'female',
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
  voices?: Array<{ id: string; label: string }>
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

function CharacterFormBody({ mode, experienceType, creationId, userId, draft = false, initial, action, closeHref, capabilities, storageKey, voices = [] }: CharacterFormProps & { storageKey: string | null }) {
  const router = useRouter()
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
  const missing = useMemo(() => [
    [!name.trim(), msg('이름')], [!personality.trim(), msg('캐릭터 소개')], [!startingContext.trim(), msg('첫 장면')],
  ].filter(([empty]) => empty).map(([, label]) => label as string), [name, personality, startingContext])
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
          {/* 유형(10/19): 대화만 / 몰입 모드(음성) / 몰입 모드(음성+영상). 몰입 모드 = 채팅을 목소리로 듣고 말로 이어 가는 모드(통화 아님). 재생은 chat/[sessionId]/immersive.tsx. */}
          {can.characterVoice&&experienceType === 'reality' && <Section title={t('유형')} subtitle={t('몰입 모드는 이 캐릭터와의 채팅을 목소리로 듣고 말로 이어 가는 모드예요. 음성+영상은 캐릭터 사진이 화면 전체에 깔려요.')}>
            <Card>
              <ChoiceChips name="media" value={media} onChange={v => setMedia(v as CharacterMedia)} columns={3}
                options={[{ value: 'text', label: t('대화') }, { value: 'voice', label: t('몰입 모드 · 음성') }, { value: 'video', label: t('몰입 모드 · 음성+영상') }]} />
              {/* 목소리(10/20): 몰입 모드를 고르면 같은 칸 안에서 바로 고른다(따로 있던 목소리 섹션은 지움). 대화만이면 읽어 줄 일이 없다. */}
              {media !== 'text' && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <p className="t-caption" style={{ margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>{t('목소리')}</p>
                  {voices.length > 0
                    ? <ChoiceChips name="voiceId" value={voiceId} onChange={setVoiceId} columns={2}
                        options={[{ value: '', label: t('기본') }, ...voices.map((v) => ({ value: v.id, label: v.label }))]} />
                    : <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>{t('아직 고를 수 있는 목소리가 없어요. 기본 목소리로 읽어 줘요.')}</p>}
                </div>
              )}
            </Card>
          </Section>}
          {/* 대상(10/28): 고르는 칸은 지웠다(사용자 요청). 저장된 값은 그대로 보낸다. */}
          <input type="hidden" name="audience" value={audience} />
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
                      <Controlled name="name" label={t('이름')} placeholder={t('짧은 이름이 부르기 편해요. 예) 수현')} max={10} value={name} onChange={setName} big />
                    </LabeledField>
                    {/* 소개(한 줄)와 성격 설명을 한 칸으로(10/19). 서버 칸 이름은 그대로 — 첫 줄이 title, 나머지가 personality. */}
                    <input type="hidden" name="title" value={title} />
                    <input type="hidden" name="personality" value={personality} />
                    <LabeledField label={t('캐릭터 소개')} required hint={t('첫 줄은 카드에 걸리는 한 줄 소개가 돼요(40자). 그 아래에 성격·가치관·말투를 적어 주세요.')}>
                      <ControlledArea name="characterIntro" label={t('캐릭터 소개')} value={intro} onChange={setIntro} max={1040} rows={6}
                        placeholder={t('예) 만지지 마십시오. …그건, 아직 당신 것이 아닙니다.\n침착하고 관찰력이 좋다. 신뢰와 약속을 중시하며, 낮고 짧은 말투로 이야기한다.')} />
                    </LabeledField>
                    {experienceType === 'reality' && <ReactionTraits initial={i} />}
                  </div>
                </IdentityCard>
              </div>
              {/* 나이·MBTI·국적·직업은 고급 — 이름과 소개만으로 카드가 된다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={profileAdvanced} onToggle={() => setProfileAdvanced((v) => !v)} controls="profile-advanced" />
              <div id="profile-advanced" hidden={!profileAdvanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <LabeledField label={t('나이')}><CountedInput name="age" placeholder={t('예) 32, 1000, 추정불가')} max={10} {...g('age')} /></LabeledField>
                  <LabeledField label="MBTI">
                    <ChoiceChips name="mbti" value={mbti} onChange={setMbti} columns={4}
                      options={[{ value: '', label: t('선택 안 함') }, ...MBTI_TYPES.map((m) => ({ value: m, label: m }))]} />
                  </LabeledField>
                  <Two>
                    <LabeledField label={t('국적')}><CountedInput name="nationality" placeholder={t('예) 영국')} max={40} {...g('nationality')} /></LabeledField>
                    <LabeledField label={t('직업')}><CountedInput name="occupation" placeholder={t('예) 고서 복원가')} max={60} {...g('occupation')} /></LabeledField>
                  </Two>
                </div>
              </div>
            </Card>
          </Section>

          {/* 상황 예시(10/28): 칸은 지웠다(사용자 요청). 이미 적힌 예시는 지우지 않게 그대로 보낸다. */}
          <input type="hidden" name="sampleDialogue" value={JSON.stringify(sampleDialogue(i.sampleDialogue))} />
          {/* 상황별 사진(10/28, 위프·베이비챗식) — 대화 중 키워드가 나오면 그 사진이 채팅에 뜬다. */}
          <Section title={t('상황별 사진 · 선택')} subtitle={t('상황 키워드와 사진을 짝지어 두면, 대화에 그 상황이 나올 때 사진이 채팅에 떠요.')}>
            <SituationImagesEditor defaultValue={i.situationImages ?? []} />
          </Section>
        </Panel>

        {/* ── 세계관 ── */}
        <Panel id="personality" show={tab === 'personality'}>
          <Section title={t('세계관')}>
            <Card>
              <LabeledField label={t('세계관 설명')} hint={experienceType === 'chat' ? t('대화에 반영되며 공개 소개에는 표시되지 않아요.') : t('캐릭터가 살아가는 시대, 장소, 배경을 적어 주세요.')}>
                <CountedTextArea name="worldSetting" ariaLabel={t('세계관 설명')} max={600} rows={4} {...g('worldSetting')}
                  placeholder={t('예) 현대 서울. 도심의 경호업체를 중심으로 다양한 사건이 벌어진다.')} />
              </LabeledField>
            </Card>
          </Section>
          <input type="hidden" name="lore" value={JSON.stringify(i.lore)} />
          <Section title={t('장르')} subtitle={t('여러 개를 고를 수 있어요. 최대 5개까지 선택하거나 직접 입력하면 홈 장르 필터와 카드 해시태그에 반영됩니다.')}>
            <Card>
              <PresetTags name="mood" label={msg('장르')} options={MOODS} max={5} defaultValue={i.mood} />
            </Card>
          </Section>

        </Panel>

        {/* ── 명령어(10/19, 외형 자리) — 채팅에서 /이름 으로 부르는 한 턴 지시. 라이브러리에서 골라 붙이거나 직접 만들어 공개한다. ── */}
        <Panel id="commands" show={tab === 'commands'}>
          <Section title={t('명령어')} subtitle={t('대화 중 /이름 으로 불러 쓰는 한 턴 지시예요. 다른 사람이 공개한 것을 그대로 붙이거나, 직접 만들어 공개할 수 있어요.')}>
            <Card>
              <CommandEditor name="commands" defaultValue={i.commands} />
            </Card>
          </Section>
        </Panel>

        {/* ── 외형 — 관계 탭 안에 함께 보인다(10/19). DOM 은 앞이지만 order 로 관계 내용 아래에 놓는다. ── */}
        <Panel id="relationship-visual" show={tab === 'relationship'} order={1}>
          <Section title={t('몸')}>
            <Card>
              {/* 체형 선택은 10/19 화면에서 뺐다 — 값은 기본(표준) 또는 자동 채우기가 정한 것을 그대로 보낸다. */}
              <input type="hidden" name="build" value={build} />
              <BodyPicker gender={gender} onGender={setGender} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <LabeledField label={t('키')}><CountedInput name="height" placeholder={t('예) 186cm')} max={20} {...g('height')} /></LabeledField>
                <LabeledField label={t('체형 설명')}><CountedInput name="detail" placeholder={t('예) 어깨가 넓다')} max={120} {...g('detail')} /></LabeledField>
              </div>

              {/* 얼굴·머리는 고급 — 몸만 정해도 사진은 나온다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={advanced} onToggle={() => setAdvanced((v) => !v)} controls="appearance-advanced" />
              <div id="appearance-advanced" hidden={!advanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{t('얼굴')}</p>
                  <LabeledField label={t('눈')}><CountedInput name="eyes" placeholder={t('예) 깊고 차가운 회청색 눈')} max={80} {...g('eyes')} /></LabeledField>
                  <Two>
                    <LabeledField label={t('코')}><CountedInput name="nose" placeholder={t('예) 곧고 높은 콧대')} max={80} {...g('nose')} /></LabeledField>
                    <LabeledField label={t('턱')}><CountedInput name="jaw" placeholder={t('예) 선이 분명한 턱')} max={80} {...g('jaw')} /></LabeledField>
                  </Two>
                  <LabeledField label={t('피부')}><CountedInput name="skin" placeholder={t('예) 창백하고 건조한 피부')} max={80} {...g('skin')} /></LabeledField>
                  <LabeledField label={t('알아보게 하는 특징')} hint={t('흉터, 점, 문신처럼 그 사람을 알아보게 하는 한 가지.')}>
                    <CountedInput name="distinctive" placeholder={t('예) 왼쪽 눈썹 끝을 가로지르는 오래된 흉터')} max={100} {...g('distinctive')} />
                  </LabeledField>

                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginTop: 'var(--space-2)' }}>{t('머리 · 인상')}</p>
                  <Two>
                    <LabeledField label={t('머리 색')}><CountedInput name="hairColor" placeholder={t('예) 어두운 갈색')} max={40} {...g('hairColor')} /></LabeledField>
                    <LabeledField label={t('머리 길이')}><CountedInput name="hairLength" placeholder={t('예) 짧고 단정한')} max={40} {...g('hairLength')} /></LabeledField>
                  </Two>
                  <LabeledField label={t('머리 스타일')}><CountedInput name="hairStyle" placeholder={t('예) 이마를 드러내게 넘긴')} max={60} {...g('hairStyle')} /></LabeledField>
                  <LabeledField label={t('평소 표정')}><CountedInput name="expression" placeholder={t('예) 표정 변화가 거의 없다')} max={120} {...g('expression')} /></LabeledField>
                  <LabeledField label={t('스타일 태그')} hint={t('옷차림·분위기. 사진 생성이 읽습니다.')}>
                    <TagInput name="styleTags" placeholder={t('예) 소매를 걷어 올린 셔츠')} max={5} maxLength={40} {...gt('styleTags')} />
                  </LabeledField>
                </div>
              </div>
            </Card>
          </Section>
          {/* 목소리 칸이 없을 때(전화가 닫힌 운영 베타)도 이미 고른 목소리는 그대로 보낸다 — 고치기 저장이 지우지 않게. */}
          {(!can.characterVoice||voices.length === 0) && voiceId && <input type="hidden" name="voiceId" value={voiceId} />}
          {!can.characterVoice&&<input type="hidden" name="media" value={media}/>}
        </Panel>

        {/* ── 관계 ── */}
        {/* 관계 탭 — 관계 태그는 캐릭터챗도 고른다(2026-09-30). 시작 관계·관계 성격은 미로 캐릭터만. */}
        <Panel id="relationship" show={tab === 'relationship'}>
          {/* 관계 태그(2026-09-30 요청) — 홈 관계 섹션이 이 값으로 거른다. 친밀도(시작 관계)와는 따로다. */}
          <Section title={t('관계 태그')} subtitle={t('어떤 사이인지 골라 주세요. 최대 4개까지 선택하거나 직접 입력하면 홈 관계 필터와 카드 해시태그에 반영됩니다.')}>
            <Card>
              <PresetTags name="relationshipKeywords" label={msg('관계 태그')} options={RELATIONS} max={4} {...gt('relationshipKeywords')} />
            </Card>
          </Section>
          {/* 관계 성격표 편집(ProfileSettings)과 세부 감정 6개는 10/19 화면에서 뺐다 — 저장 때 AI 가 만든 표와 프리셋 값이 그대로 쓰인다. 일상·연락도 이 탭으로 합쳤다. */}
          {experienceType === 'reality' && <>
          <Section title={t('시작 관계')} subtitle={t('처음 어떤 사이인지 골라 주세요. 관계는 대화하며 달라져요.')}>
            <RelationshipSettings initial={i} />
          </Section>
          <Section title={t('일상·연락')}>
            <ContactSettings initial={i} mode={mode} capabilities={capabilities} />
          </Section>
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
        <Panel id="intro-dialogue" show={tab === 'intro'}>
          <Section title={t('인트로 대화')} subtitle={t('새 채팅이 열릴 때 캐릭터가 먼저 건네는 말이에요. 비워 두면 사용자가 먼저 말을 걸어요.')}>
            <div className="create-intro-editor">
              <DialogueEditor intro fill name="introDialogue" characterName={name} defaultValue={genIntro ?? introDialogue(i.sampleDialogue)} />
            </div>
          </Section>
        </Panel>

        {/* ── 소개 페이지 ── */}
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
  if (first.length <= 40 && rest) return { title: first, personality: rest.slice(0, 1000) }
  return { title: first.slice(0, 40), personality: whole.slice(0, 1000) }
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
  name: string; label: string; placeholder: string; max: number; value: string; onChange: (v: string) => void; big?: boolean
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
  name: string; label: string; placeholder: string; max: number; rows: number; value: string; onChange: (v: string) => void
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
