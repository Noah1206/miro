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
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, IntroText, LabeledField, PresetTags, Switch, TagInput, box, fieldFont, fieldPad, type Step } from './form-parts'
import { MOODS } from './parse'
import { quickFill, type QuickFill } from './assist'
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
  /** 명령어(10/19) — 채팅에서 /이름 으로 부르는 한 턴 지시의 복사본. */
  commands: CharacterCommand[]
  /** 캐릭터 유형(10/19): 대화만 / 음성통화 / 음성+영상통화. */
  media: CharacterMedia
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
  startingContext: '', worldLocation: '', startingTime: '', sampleDialogue: [], lore: [], commands: [], media: 'text',
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
  capabilities: ContactCapabilities
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
  const [title, setTitle] = useState(i.title)
  const [personality, setPersonality] = useState(i.personality)
  const [startingContext, setStartingContext] = useState(i.startingContext)
  const [sampleCharacterCount, setSampleCharacterCount] = useState(() => sampleDialogue(i.sampleDialogue).reduce((sum, turn) => sum + turn.text.length, 0))
  const [sampleOpen, setSampleOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const [mbti, setMbti] = useState<string>(i.mbti)
  const [gender, setGender] = useState<string>(i.gender)
  const [build, setBuild] = useState<string>(i.build)
  const [voiceId, setVoiceId] = useState<string>(i.voiceId)
  const [advanced, setAdvanced] = useState(false)
  const [profileAdvanced, setProfileAdvanced] = useState(false)
  const [isPublic, setIsPublic] = useState(i.isPublic)
  const [media, setMedia] = useState<CharacterMedia>(i.media)
  // 소개 미리보기의 통화 아이콘은 고른 유형을 따른다 — 운영 플래그가 닫혀 있어도 음성·영상 유형이면 그 캐릭터의 방에서는 열린다(10/19).
  const can = { ...capabilities, voiceCall: capabilities.voiceCall || media !== 'text', videoCall: capabilities.videoCall || media === 'video' }
  const [hobbies, setHobbies] = useState(i.hobbies)
  const [dislikes, setDislikes] = useState(i.dislikes)
  // 자동 채우기(10/19)가 넣은 값. uncontrolled 칸은 key 를 바꿔 다시 그리며 defaultValue 로 받는다 — 빈 칸에만 넣으므로 적은 값을 덮지 않는다.
  const [gen, setGen] = useState<Partial<Record<string, string>>>({})
  const [genTags, setGenTags] = useState<Partial<Record<'styleTags' | 'relationshipKeywords', string[]>>>({})
  const [genIntro, setGenIntro] = useState<Array<{ role: 'character'; text: string; purpose: 'intro' }> | null>(null)
  const g = (k: keyof FormInitial & string) => ({ key: `${k}:${gen[k] ?? ''}`, defaultValue: gen[k] ?? String(i[k] ?? '') })
  const gt = (k: 'styleTags' | 'relationshipKeywords') => ({ key: `${k}:${(genTags[k] ?? []).join(',')}`, defaultValue: genTags[k] ?? i[k] })
  // 소개 페이지 미리보기 — 탭을 열 때 폼을 한 번 읽는다. 칸을 전부 controlled 로 바꾸지 않는다.
  const formRef = useRef<HTMLFormElement>(null)
  const [fillText, setFillText] = useState('')
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')
  /** 설명(또는 이미 적은 칸)으로 초안을 받아 비어 있는 칸에만 넣는다. 성별·체형은 초안을 따른다 — 사진이 설명과 같은 사람이게. */
  const fill = async () => {
    const form = formRef.current
    if (!form || filling) return
    const fd = new FormData(form)
    const cur = (k: string) => String(fd.get(k) ?? '').trim()
    if (!fillText.trim() && !cur('name') && !cur('personality')) { setFillError(msg('어떤 캐릭터인지 한두 문장만 적어 주세요.')); return }
    setFilling(true); setFillError('')
    let d: QuickFill
    try {
      d = await quickFill(fillText, { name: cur('name'), title: cur('title'), personality: cur('personality'), age: cur('age'), nationality: cur('nationality'), occupation: cur('occupation'), worldSetting: cur('worldSetting'), startingContext: cur('startingContext') })
    } catch { setFillError(msg('지금은 채우지 못했어요. 잠시 뒤 다시 눌러 주세요.')); setFilling(false); return }
    if (!cur('name')) setName(d.name)
    if (!cur('title')) setTitle(d.title)
    if (!cur('personality')) setPersonality(d.personality)
    if (!cur('startingContext')) setStartingContext(d.startingContext)
    if (!cur('mbti')) setMbti(d.mbti)
    setGender(d.gender); setBuild(d.build)
    if (!hobbies.length) setHobbies(d.hobbies)
    if (!dislikes.length) setDislikes(d.dislikes)
    const next: Record<string, string> = {}
    for (const k of ['age', 'nationality', 'occupation', 'worldSetting', 'worldLocation', 'startingTime', 'height', 'detail', 'eyes', 'nose', 'jaw', 'skin', 'distinctive', 'hairColor', 'hairLength', 'hairStyle', 'expression'] as const) {
      if (!cur(k) && d[k]) next[k] = d[k]
    }
    setGen(prev => ({ ...prev, ...next }))
    setGenTags(prev => ({ ...prev,
      ...(!cur('styleTags') && d.styleTags.length ? { styleTags: d.styleTags } : {}),
      ...(!cur('relationshipKeywords') && d.relationshipKeywords.length ? { relationshipKeywords: d.relationshipKeywords } : {}) }))
    if (introDialogue(JSON.parse(cur('introDialogue') || '[]')).length === 0 && d.firstLine) setGenIntro([{ role: 'character', text: d.firstLine, purpose: 'intro' }])
    setFilling(false)
  }
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
  const openTab = (next: CreateTab) => {
    if (next === 'preview' && formRef.current) setSnap((prev) => { if (prev) [prev.photo, ...prev.gallery].forEach(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url) }); return snapshot(formRef.current!) })
    setTab(next)
  }

  // 게시가 잠긴 이유를 이름으로 보여 준다(10/19) — 어느 칸이 비었는지 탭을 뒤지지 않게.
  const missing = useMemo(() => [
    [!name.trim(), msg('이름')], [!title.trim(), msg('소개')], [!personality.trim(), msg('성격')], [!startingContext.trim(), msg('첫 장면')],
  ].filter(([empty]) => empty).map(([, label]) => label as string), [name, title, personality, startingContext])
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
    <main id="main" tabIndex={-1} className="page create-page" style={{ maxWidth: 560, paddingTop: 0, ...(mode === 'create' ? { paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))' } : {}), outline: 'none' }}>
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
          {/* 자동 채우기(10/19) — 한두 문장이면 빈 칸을 AI 가 채운다. 적은 칸은 건드리지 않는다. */}
          <Section title={t('AI로 채우기')} subtitle={t('어떤 캐릭터인지 한두 문장만 적으면 비어 있는 칸을 채워 드려요. 이미 적은 칸은 그대로 둬요.')}>
            <Card>
              <div style={{ padding: fieldPad, paddingBottom: 'var(--field-pad-b, 3px)', ...box(false) }}>
                <textarea value={fillText} onChange={e => setFillText(e.target.value)} rows={2} maxLength={300} aria-label={t('AI로 채우기')}
                  placeholder={t('예) 다른 사람한텐 싸가지 없는데 나한테만 잘해주는 30살 검사')}
                  style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: fieldFont, lineHeight: 1.5, fontFamily: 'inherit' }} />
              </div>
              {fillError && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)', marginTop: 8 }}>{t(fillError)}</p>}
              <button type="button" onClick={() => void fill()} disabled={filling}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, marginTop: 10, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: 0, cursor: filling ? 'default' : 'pointer',
                  background: filling ? 'var(--color-surface-3)' : 'var(--color-accent)', color: filling ? 'var(--color-text-secondary)' : 'var(--color-accent-on)', fontSize: 'var(--font-body-size)', fontWeight: 'var(--weight-semibold)' }}>
                {filling ? t('채우는 중…') : t('빈 칸 채우기')}
              </button>
            </Card>
          </Section>
          {/* 유형(10/19): 대화만 / 음성통화 / 음성+영상통화. 통화는 이 값이 연다(config callAllowedFor). */}
          {experienceType === 'reality' && <Section title={t('유형')} subtitle={t('음성이나 영상을 고르면 이 캐릭터의 방에서 통화가 열리고, 캐릭터도 상황에 따라 전화를 걸어요.')}>
            <Card>
              <ChoiceChips name="media" value={media} onChange={v => setMedia(v as CharacterMedia)} columns={3}
                options={[{ value: 'text', label: t('대화') }, { value: 'voice', label: t('대화 + 음성통화') }, { value: 'video', label: t('대화 + 음성·영상통화') }]} />
            </Card>
          </Section>}
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
              {mode === 'create' && <p className="t-caption" style={{ marginTop: 8, color: 'var(--color-text-tertiary)' }}>{t('선택한 이미지는 임시저장해야 다음에도 유지됩니다.')}</p>}
              <div style={{ marginTop: 'var(--space-5)' }}>
                <IdentityCard>
                  <div className="stack" style={{ gap: 18 }}>
                    <LabeledField label={t('이름')} required error={name === '' ? null : undefined}>
                      <Controlled name="name" label={t('이름')} placeholder={t('짧은 이름이 부르기 편해요. 예) 수현')} max={10} value={name} onChange={setName} big />
                    </LabeledField>
                    <LabeledField label={t('소개')} required hint={t('카드와 소개 페이지에서 이름 아래에 걸리는 한 줄. 캐릭터가 직접 하는 말이면 좋습니다.')}>
                      <Controlled name="title" label={t('소개')} placeholder={t('예) 만지지 마십시오. …그건, 아직 당신 것이 아닙니다.')} max={40} value={title} onChange={setTitle} big />
                    </LabeledField>
                    <LabeledField label={experienceType === 'chat' ? t('성격·말투 설정') : t('성격 설명')} required
                      hint={experienceType === 'chat' ? t('대화에 반영되며 공개 소개에는 표시되지 않아요.') : t('캐릭터의 성격, 가치관, 말투를 적어 주세요.')}>
                      <ControlledArea name="personality" label={experienceType === 'chat' ? t('성격·말투 설정') : t('성격 설명')} value={personality} onChange={setPersonality} max={1000} rows={4}
                        placeholder={t('예) 침착하고 관찰력이 좋다. 신뢰와 약속을 중시하며, 낮고 짧은 말투로 이야기한다.')} />
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

          <Section title={t('상황 예시 · 선택')}>
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('상황 예시로 캐릭터의 성격과 말투를 표현해 주세요. 상세페이지에 표시됩니다.')}<br />
              {t('{n}자', { n: sampleCharacterCount.toLocaleString() })}
            </p>
            <motion.button type="button" aria-expanded={sampleOpen} aria-controls="sample-dialogue-editor" onClick={() => setSampleOpen((open) => !open)}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, marginTop: 20, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', cursor: 'pointer' }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              {t('상황 예시 추가')}
            </motion.button>
            <div id="sample-dialogue-editor" hidden={!sampleOpen} inert={!sampleOpen}>
              <motion.div initial={false} animate={{ y: reduceMotion || sampleOpen ? 0 : '100%' }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', margin: '0 auto', maxWidth: 'var(--app-w)' }}>
                <div style={{ display: 'flex', alignItems: 'center', minHeight: 56, padding: '0 var(--gutter)', flexShrink: 0 }}>
                  <button type="button" onClick={() => setSampleOpen(false)} aria-label={t('상황 예시 닫기')}
                    style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                    <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                  <h2 className="t-title-3" style={{ flex: 1, textAlign: 'center' }}>{t('상황 예시')}</h2>
                  <button type="button" onClick={() => setSampleOpen(false)}
                    style={{ padding: '8px 4px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-white)', fontSize: 'var(--font-body-size)', fontWeight: 'var(--weight-semibold)' }}>{t('확인')}</button>
                </div>
                <div style={{ flex: 1, minHeight: 0, padding: '0 var(--gutter)' }}>
                  <DialogueEditor name="sampleDialogue" characterName={name} defaultValue={sampleDialogue(i.sampleDialogue)} onCharacterCountChange={setSampleCharacterCount} fill />
                </div>
              </motion.div>
            </div>
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
          {/* 명령어 북(10/19) — 채팅에서 /이름 으로 부르는 한 턴 지시. 라이브러리에서 골라 붙이거나 직접 만들어 공개한다. */}
          <Section title={t('명령어')} subtitle={t('대화 중 /이름 으로 불러 쓰는 한 턴 지시예요. 다른 사람이 공개한 것을 그대로 붙이거나, 직접 만들어 공개할 수 있어요.')}>
            <Card>
              <CommandEditor name="commands" defaultValue={i.commands} />
            </Card>
          </Section>

        </Panel>

        {/* ── 외형 ── */}
        <Panel id="appearance" show={tab === 'appearance'}>
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
          {voices.length === 0 && voiceId && <input type="hidden" name="voiceId" value={voiceId} />}
          {voices.length > 0 && (
            <Section title={t('목소리')} subtitle={t('운영팀이 준비한 공식 목소리 중에서 고를 수 있어요.')}>
              <Card>
                <ChoiceChips name="voiceId" value={voiceId} onChange={setVoiceId} columns={2}
                  options={[{ value: '', label: t('기본') }, ...voices.map((v) => ({ value: v.id, label: v.label }))]} />
              </Card>
            </Section>
          )}
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
          <Section title={t('인트로 대화')} subtitle={t('새 채팅이 열릴 때 캐릭터가 먼저 건네는 말이에요. 비워 두면 사용자가 먼저 말을 걸어요.')}>
            <Card>
              <IntroText key={`intro:${genIntro?.[0]?.text ?? ''}`} name="introDialogue" characterName={name} defaultValue={genIntro ?? introDialogue(i.sampleDialogue)} />
              <input type="hidden" name="startingTime" value={gen.startingTime ?? i.startingTime} />
            </Card>
          </Section>
        </Panel>

        {/* ── 소개 페이지 ── */}
        <Panel id="preview" show={tab === 'preview'}>
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

/** 탭 패널. 감춰도 DOM 에 남긴다 — 값이 살아 있어야 한 번에 제출된다. */
function Panel({ id, show, children }: { id: string; show: boolean; children: React.ReactNode }) {
  return <div id={`panel-${id}`} role="tabpanel" hidden={!show} inert={!show}>{children}</div>
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
