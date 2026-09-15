'use client'
import { S } from '@/lib/character-options'
import { useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BUILD_PRESETS, BUILD_TYPES, GENDER_PRESETS, GENDER_TYPES, stageLabel } from '@miro/domain'
import { CreateHeader, type CreateTab } from './header'
import { CreateTour } from './tour'
import { STAGES } from './parse'
import { DetailPreview, snapshot, type Snapshot } from './preview'
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, LabeledField, PresetTags, Rows, Stepped, Switch, TagInput, box, type Step } from './form-parts'
import { MOODS } from './parse'

/**
 * 선택지용 라벨. 대화 화면의 stageLabel 은 ambiguous 와 flirting 을 일부러 같은 말('서로를 의식함')로
 * 보여주지만, 고르는 자리에서 같은 글자가 두 번 나오면 무엇을 고르는지 알 수 없다.
 */
const STAGE_PICK: Partial<Record<(typeof STAGES)[number], string>> = {
  ambiguous: '애매한 사이',
  flirting: '썸 타는 중',
}
const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const
const CHANNELS = [
  { value: 'message', label: '메시지' }, { value: 'photo', label: '사진' },
  // 4열 칩이라 '음성 메시지' 는 두 줄로 꺾인다 — 칩만 짧게. 아래 항목 제목은 온전한 이름을 쓴다.
  { value: 'voice_message', label: '음성' }, { value: 'voice_call', label: '전화' },
] as const


/**
 * 단계 정의. 값은 0–100 그대로 저장되고, 라벨·설명만 사람 말이다.
 * 연락 빈도의 시간은 엔진 공식(72h − 빈도×0.66h)에서 역산한 실제 값이다.
 */


/**
 * 고급 만들기 (명세서 2.2): 프로필·성격·외형·세계·관계·연락 성향을 직접 정한다.
 * 탭은 보이기만 바꾼다 — 모든 칸이 DOM 에 남아 마지막에 한 번에 제출된다.
 */
export type FormInitial = {
  name: string; title: string; worldSetting: string; age: string; mbti: string; nationality: string; occupation: string
  personality: string; hobbies: string[]; dislikes: string[]; mood: string[]; jealousy: number; initiative: number; emotionalExpression: number
  gender: string; build: string; height: string; detail: string
  eyes: string; nose: string; jaw: string; skin: string; distinctive: string
  hairColor: string; hairLength: string; hairStyle: string; expression: string; styleTags: string[]
  stage: string; trust: number; attraction: number; emotionalDistance: number; attachment: number; protectiveness: number; relJealousy: number
  relationshipKeywords: string[]
  contactEnabled: boolean; contactFrequency: number; initiativeLevel: number; replyDelayMinutes: number
  activeHoursStart: string; activeHoursEnd: string; preferredChannel: string
  photoProbability: number; voiceMessageProbability: number; callProbability: number; videoCallProbability: number; senderLabel: string
  startingContext: string; startingTime: string; sampleDialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
  isPublic: boolean
  /** 이미 저장된 사진 URL (편집 화면). 대표가 첫 번째. */
  images: string[]
}

/** 빈 폼. 숫자 기본값은 parse.ts 의 fallback 과 같아야 한다. */
export const EMPTY: FormInitial = {
  name: '', title: '', worldSetting: '', age: '', mbti: '', nationality: '', occupation: '',
  personality: '', hobbies: [], dislikes: [], mood: [], jealousy: 50, initiative: 50, emotionalExpression: 50,
  gender: 'male', build: 'average', height: '', detail: '',
  eyes: '', nose: '', jaw: '', skin: '', distinctive: '',
  hairColor: '', hairLength: '', hairStyle: '', expression: '', styleTags: [],
  stage: 'stranger', trust: 30, attraction: 10, emotionalDistance: 60, attachment: 10, protectiveness: 20, relJealousy: 0,
  relationshipKeywords: [],
  contactEnabled: true, contactFrequency: 50, initiativeLevel: 50, replyDelayMinutes: 5,
  activeHoursStart: '08:00', activeHoursEnd: '23:00', preferredChannel: 'message',
  photoProbability: 20, voiceMessageProbability: 20, callProbability: 30, videoCallProbability: 10, senderLabel: '',
  startingContext: '', startingTime: '', sampleDialogue: [],
  isPublic: false,
  images: [],
}

/**
 * 캐릭터 폼 — 만들기와 편집이 같은 화면이다 (명세서 2.2).
 * 탭은 보이기만 바꾼다 — 모든 칸이 DOM 에 남아 마지막에 한 번에 제출된다.
 * mode=edit 이고 draft 가 아니면 머리에 '저장' 하나, 프로필 맨 위에 공개 스위치가 붙는다.
 */
export function CharacterForm({ mode, draft = false, initial, action, closeHref }: {
  mode: 'create' | 'edit'
  draft?: boolean
  initial?: Partial<FormInitial>
  action: (form: FormData) => Promise<void>
  closeHref: string
}) {
  const i: FormInitial = { ...EMPTY, ...initial }
  const [tab, setTab] = useState<CreateTab>('profile')
  // 상황은 전체 화면으로 열린다 — 닫으면 열기 전 탭으로 돌아간다.
  const [prevTab, setPrevTab] = useState<CreateTab>('profile')
  const [pending, setPending] = useState(false)

  // 필수 판정에 쓰는 값만 통제한다. 나머지는 uncontrolled — 제출 때 FormData 가 모은다.
  const [name, setName] = useState(i.name)
  const [title, setTitle] = useState(i.title)
  const [personality, setPersonality] = useState(i.personality)
  const [startingContext, setStartingContext] = useState(i.startingContext)
  const [mbti, setMbti] = useState<string>(i.mbti)
  const [gender, setGender] = useState<string>(i.gender)
  const [build, setBuild] = useState<string>(i.build)
  const [stage, setStage] = useState<string>(i.stage)
  const [contactOn, setContactOn] = useState(i.contactEnabled)
  const [channel, setChannel] = useState<string>(i.preferredChannel)
  const [advanced, setAdvanced] = useState(false)
  const [profileAdvanced, setProfileAdvanced] = useState(false)
  const [isPublic, setIsPublic] = useState(i.isPublic)
  // 소개 페이지 미리보기 — 탭을 열 때 폼을 한 번 읽는다. 칸을 전부 controlled 로 바꾸지 않는다.
  const formRef = useRef<HTMLFormElement>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const openTab = (t: CreateTab) => {
    if (t === 'intro' && tab !== 'intro') setPrevTab(tab)
    if (t === 'preview' && formRef.current) setSnap((prev) => { if (prev?.photo) URL.revokeObjectURL(prev.photo); return snapshot(formRef.current!) })
    setTab(t)
  }

  const missing = useMemo(() => {
    const m = new Set<CreateTab>()
    if (!name.trim() || !title.trim()) m.add('profile')
    if (!personality.trim()) m.add('personality')
    if (!startingContext.trim()) m.add('intro')
    return m
  }, [name, title, personality, startingContext])
  const canSubmit = missing.size === 0
  const canDraft = name.trim().length > 0


  return (
    // Page 는 transform 을 걸어 sticky 를 깨뜨리므로 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page" style={{ maxWidth: 560, paddingTop: 0, outline: 'none' }}>
      <form ref={formRef} action={action} onSubmit={() => setPending(true)} className="stack" style={{ gap: 0 }}>

        <CreateHeader tab={tab} onTab={openTab} canSubmit={canSubmit} canDraft={canDraft} pending={pending}
          buttons={mode === 'edit' && !draft ? 'save' : 'create'} closeHref={closeHref} />
        {mode === 'create' && <CreateTour tab={tab} onTab={openTab} />}

        {/* ── 프로필 ── */}
        <Panel id="profile" show={tab === 'profile'}>
          {mode === 'edit' && !draft && (
            <Section title="공개">
              <Card>
                <Switch name="isPublic" checked={isPublic} onChange={setIsPublic}
                  label="다른 사람에게 공개"
                  hint="켜면 홈과 발견에 실리고, 누구나 이 캐릭터와 대화를 시작할 수 있습니다." />
              </Card>
            </Section>
          )}
          <Section title="캐릭터">
            <Card>
              <ImagePicker label="캐릭터 이미지" maxCount={5} existing={i.images} />
              <div style={{ marginTop: 'var(--space-5)' }}>
                <IdentityCard>
                  <div className="stack" style={{ gap: 18 }}>
                    <LabeledField label="이름" required error={name === '' ? null : undefined}>
                      <Controlled name="name" placeholder="짧은 이름이 부르기 편해요. 예) 수현" max={10} value={name} onChange={setName} big />
                    </LabeledField>
                    <LabeledField label="소개" required hint="카드와 소개 페이지에서 이름 아래에 걸리는 한 줄. 캐릭터가 직접 하는 말이면 좋습니다.">
                      <Controlled name="title" placeholder="예) 만지지 마십시오. …그건, 아직 당신 것이 아닙니다." max={40} value={title} onChange={setTitle} big />
                    </LabeledField>
                    <LabeledField label="설명" hint="시대·장소·장르까지 여기에 적으면 세계관이 됩니다.">
                      <CountedTextArea name="worldSetting" max={600} rows={3} defaultValue={i.worldSetting}
                        placeholder="상황, 관계, 세계관 등을 설명해주세요." />
                    </LabeledField>
                  </div>
                </IdentityCard>
              </div>
              {/* 나이·MBTI·국적·직업은 고급 — 이름과 소개만으로 카드가 된다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={profileAdvanced} onToggle={() => setProfileAdvanced((v) => !v)} controls="profile-advanced" />
              <div id="profile-advanced" hidden={!profileAdvanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <LabeledField label="나이"><CountedInput name="age" placeholder="예) 32, 1000, 추정불가" max={10} defaultValue={i.age} /></LabeledField>
                  <LabeledField label="MBTI">
                    <ChoiceChips name="mbti" value={mbti} onChange={setMbti} columns={4}
                      options={[{ value: '', label: '선택 안 함' }, ...MBTI_TYPES.map((m) => ({ value: m, label: m }))]} />
                  </LabeledField>
                  <Two>
                    <LabeledField label="국적"><CountedInput name="nationality" placeholder="예) 영국" max={40} defaultValue={i.nationality} /></LabeledField>
                    <LabeledField label="직업"><CountedInput name="occupation" placeholder="예) 고서 복원가" max={60} defaultValue={i.occupation} /></LabeledField>
                  </Two>
                </div>
              </div>
            </Card>
          </Section>
        </Panel>

        {/* ── 성격 ── */}
        <Panel id="personality" show={tab === 'personality'}>
          <Section title="성격">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="어떤 사람인가요" required hint="특징·가치관·말투를 한 번에 적어 주세요.">
                  <ControlledArea name="personality" value={personality} onChange={setPersonality} max={1000} rows={6}
                    placeholder={'예) 감정을 드러내지 않고 거리를 둔다. 예의는 갖추지만 다정하지는 않다.\n약속과 원칙을 지키고, 말보다 행동으로 증명한다.\n존대. 문장이 짧고 군더더기가 없다.'} />
                </LabeledField>
              </div>
            </Card>
          </Section>
          <Section title="분위기" subtitle="카드에 해시태그로 붙고, 비슷한 캐릭터를 찾는 기준이 됩니다.">
            <Card>
              <PresetTags name="mood" options={MOODS} max={5} defaultValue={i.mood} />
            </Card>
          </Section>
          <Section title="성향" subtitle="같은 상황에서도 이 캐릭터가 어떻게 느끼고 반응할지 정합니다.">
            <Card>
              <Rows>
                <Stepped name="jealousy" label="질투" defaultValue={i.jealousy} options={S.jealousy} />
                <Stepped name="initiative" label="주도성" defaultValue={i.initiative} options={S.initiative} />
                <Stepped name="emotionalExpression" label="감정 표현" defaultValue={i.emotionalExpression} options={S.emotionalExpression} />
              </Rows>
            </Card>
          </Section>
        </Panel>

        {/* ── 외형 ── */}
        <Panel id="appearance" show={tab === 'appearance'}>
          <Section title="몸">
            <Card>
              <BodyPicker build={build} onBuild={setBuild} gender={gender} onGender={setGender} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <LabeledField label="키"><CountedInput name="height" placeholder="예) 186cm" max={20} defaultValue={i.height} /></LabeledField>
                <LabeledField label="체형 설명"><CountedInput name="detail" placeholder="예) 어깨가 넓다" max={120} defaultValue={i.detail} /></LabeledField>
              </div>

              {/* 얼굴·머리는 고급 — 몸만 정해도 사진은 나온다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={advanced} onToggle={() => setAdvanced((v) => !v)} controls="appearance-advanced" />
              <div id="appearance-advanced" hidden={!advanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>얼굴</p>
                  <LabeledField label="눈"><CountedInput name="eyes" placeholder="예) 깊고 차가운 회청색 눈" max={80} defaultValue={i.eyes} /></LabeledField>
                  <Two>
                    <LabeledField label="코"><CountedInput name="nose" placeholder="예) 곧고 높은 콧대" max={80} defaultValue={i.nose} /></LabeledField>
                    <LabeledField label="턱"><CountedInput name="jaw" placeholder="예) 선이 분명한 턱" max={80} defaultValue={i.jaw} /></LabeledField>
                  </Two>
                  <LabeledField label="피부"><CountedInput name="skin" placeholder="예) 창백하고 건조한 피부" max={80} defaultValue={i.skin} /></LabeledField>
                  <LabeledField label="알아보게 하는 특징" hint="흉터, 점, 문신처럼 그 사람을 알아보게 하는 한 가지.">
                    <CountedInput name="distinctive" placeholder="예) 왼쪽 눈썹 끝을 가로지르는 오래된 흉터" max={100} defaultValue={i.distinctive} />
                  </LabeledField>

                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginTop: 'var(--space-2)' }}>머리 · 인상</p>
                  <Two>
                    <LabeledField label="머리 색"><CountedInput name="hairColor" placeholder="예) 어두운 갈색" max={40} defaultValue={i.hairColor} /></LabeledField>
                    <LabeledField label="머리 길이"><CountedInput name="hairLength" placeholder="예) 짧고 단정한" max={40} defaultValue={i.hairLength} /></LabeledField>
                  </Two>
                  <LabeledField label="머리 스타일"><CountedInput name="hairStyle" placeholder="예) 이마를 드러내게 넘긴" max={60} defaultValue={i.hairStyle} /></LabeledField>
                  <LabeledField label="평소 표정"><CountedInput name="expression" placeholder="예) 표정 변화가 거의 없다" max={120} defaultValue={i.expression} /></LabeledField>
                  <LabeledField label="스타일 태그" hint="옷차림·분위기. 사진 생성이 읽습니다.">
                    <TagInput name="styleTags" placeholder="예) 소매를 걷어 올린 셔츠" max={5} maxLength={40} defaultValue={i.styleTags} />
                  </LabeledField>
                </div>
              </div>
            </Card>
          </Section>
        </Panel>

        {/* ── 관계 ── */}
        <Panel id="relationship" show={tab === 'relationship'}>
          <Section title="시작 관계" subtitle="처음 만났을 때 두 사람이 서 있는 자리. 대화하면서 바뀝니다.">
            <Card>
              <LabeledField label="관계 단계">
                <ChoiceChips name="stage" value={stage} onChange={setStage}
                  options={STAGES.map((s) => ({ value: s, label: STAGE_PICK[s] ?? stageLabel(s) }))} />
              </LabeledField>
              <Rows style={{ marginTop: 'var(--space-5)' }}>
                <Stepped name="trust" label="신뢰" defaultValue={i.trust} options={S.trust} />
                <Stepped name="attraction" label="호감" defaultValue={i.attraction} options={S.attraction} />
                <Stepped name="emotionalDistance" label="정서적 거리" defaultValue={i.emotionalDistance} options={S.emotionalDistance} />
                <Stepped name="attachment" label="애착" defaultValue={i.attachment} options={S.attachment} />
                <Stepped name="protectiveness" label="보호 성향" defaultValue={i.protectiveness} options={S.protectiveness} />
                <Stepped name="relJealousy" label="질투 (관계)" defaultValue={i.relJealousy} options={S.relJealousy} />
              </Rows>
            </Card>
          </Section>
        </Panel>

        {/* ── 연락 ── */}
        <Panel id="contact" show={tab === 'contact'}>
          <Section title="앱 밖에서">
            <Card>
              {/* 답장 시간·활동 시간은 화면에서 뺐다 — 기본값(5분, 08–23시)을 쓰고, 편집에서는 저장된 값을 그대로 넘긴다. */}
              <input type="hidden" name="replyDelayMinutes" value={String(i.replyDelayMinutes)} />
              <input type="hidden" name="activeHoursStart" value={i.activeHoursStart} />
              <input type="hidden" name="activeHoursEnd" value={i.activeHoursEnd} />
              <Switch name="contactEnabled" checked={contactOn} onChange={setContactOn}
                label="먼저 연락하기"
                hint="앱을 닫아도 캐릭터가 상황과 성격에 맞춰 먼저 메시지·사진·통화를 보냅니다." />
            </Card>
          </Section>
          {contactOn && (
            <>
              <Section title="세계 안에서 보이는 모습" subtitle="같은 기능도 세계관에 맞게 다르게 보입니다.">
                <Card>
                  <LabeledField label="발신자 표시" hint="예) 히사시는 '알 수 없는 번호', 토마스는 '편지'.">
                    <CountedInput name="senderLabel" placeholder="비워 두면 이름으로 옵니다" max={30} defaultValue={i.senderLabel} />
                  </LabeledField>
                </Card>
              </Section>
              <Section title="얼마나">
                <Card>
                  <Rows>
                    <Stepped name="contactFrequency" label="연락 빈도" defaultValue={i.contactFrequency} options={S.contactFrequency} />
                    <Stepped name="initiativeLevel" label="주도성" defaultValue={i.initiativeLevel} options={S.initiativeLevel} />
                  </Rows>
                </Card>
              </Section>
              <Section title="어떻게">
                <Card>
                  <LabeledField label="선호 채널">
                    <ChoiceChips name="preferredChannel" value={channel} onChange={setChannel} options={[...CHANNELS]} columns={4} />
                  </LabeledField>
                  <Rows style={{ marginTop: 'var(--space-5)' }}>
                    <Stepped name="photoProbability" label="사진" defaultValue={i.photoProbability} options={S.media} />
                    <Stepped name="voiceMessageProbability" label="음성 메시지" defaultValue={i.voiceMessageProbability} options={S.media} />
                    <Stepped name="callProbability" label="전화" defaultValue={i.callProbability} options={S.media} />
                    <Stepped name="videoCallProbability" label="영상통화" defaultValue={i.videoCallProbability} options={S.media} />
                  </Rows>
                </Card>
              </Section>
            </>
          )}
        </Panel>

        {/* ── 상황 — 탭 아래 카드가 아니라 채팅 편집 화면이 전체로 열린다. 칸은 닫혀도 DOM 에 남는다. ── */}
        <Panel id="intro" show={tab === 'intro'}>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', margin: '0 auto', maxWidth: 'var(--app-w)' }}>
            <div style={{ display: 'flex', alignItems: 'center', minHeight: 56, padding: '0 var(--gutter)', flexShrink: 0 }}>
              <button type="button" onClick={() => setTab(prevTab)} aria-label="닫기"
                style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              <h2 className="t-title-3" style={{ flex: 1, textAlign: 'center' }}>상황</h2>
              <button type="button" onClick={() => setTab(prevTab)}
                style={{ padding: '8px 4px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-accent-text)', fontSize: 'var(--font-body-size)', fontWeight: 'var(--weight-semibold)' }}>
                확인
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '0 var(--gutter)' }}>
              <DialogueEditor name="sampleDialogue" characterName={name} defaultValue={i.sampleDialogue} fill
                header={
                  <div style={{ padding: '14px 0 6px' }}>
                    <LabeledField label="첫 장면" required hint="대화가 여기서 시작돼요. 아래 예시는 소개 페이지에 실립니다.">
                      <ControlledArea name="startingContext" value={startingContext} onChange={setStartingContext} max={600} rows={3}
                        placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
                    </LabeledField>
                  </div>
                } />
              <input type="hidden" name="startingTime" value={i.startingTime} />
            </div>
          </div>
        </Panel>

        {/* ── 소개 페이지 ── */}
        <Panel id="preview" show={tab === 'preview'}>
          <DetailPreview d={snap} />
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

/** 이름·소개·설명만 따로 묶는 판 — 카드의 핵심 정보라 다른 필드와 시각적으로 구분한다. */
function IdentityCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>{children}</div>
}

/** '고급 설정' 접기 버튼 — 카드 아래 전체 너비. 열리면 화살표가 뒤집힌다. 접힌 내용은 hidden 으로만 감춰 제출에 포함된다. */
function AdvancedToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
        minHeight: 52, marginTop: 'var(--space-5)', padding: '14px 16px', borderRadius: 'var(--radius-button)',
        background: 'var(--color-surface-3)', border: 0, cursor: 'pointer',
        color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)',
      }}>
      고급 설정
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
function Controlled({ name, placeholder, max, value, onChange, big }: {
  name: string; placeholder: string; max: number; value: string; onChange: (v: string) => void; big?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', ...box(focused) }}>
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
      {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
    </div>
  )
}

function ControlledArea({ name, placeholder, max, rows, value, onChange }: {
  name: string; placeholder: string; max: number; rows: number; value: string; onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: '6px 10px 3px', ...box(focused) }}>
      <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 14 }}>
        {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
      </div>
    </div>
  )
}

/** 성별·체형 — 낱말이 아니라 사진에서 고른다. 네 장은 같은 옷·배경·거리라 체형만 다르다. */
function BodyPicker({ build, onBuild, gender, onGender }: {
  build: string; onBuild: (b: string) => void; gender: string; onGender: (g: string) => void
}) {
  const reduce = useReducedMotion()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>성별 · 체형</legend>
      <ChoiceChips name="gender" value={gender} onChange={onGender} columns={2}
        options={GENDER_TYPES.map((g) => ({ value: g, label: GENDER_PRESETS[g].label }))} />
      <input type="hidden" name="build" value={build} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 'var(--space-4)' }}>
        {BUILD_TYPES.map((b) => {
          const on = b === build
          return (
            <motion.button key={b} type="button" onClick={() => onBuild(b)} aria-pressed={on}
              aria-label={`${GENDER_PRESETS[gender as keyof typeof GENDER_PRESETS]?.label} ${BUILD_PRESETS[b].label}`}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{ padding: 3, cursor: 'pointer', borderRadius: 'var(--radius-md)', background: 'none', border: `0.5px solid ${on ? 'var(--color-accent)' : 'transparent'}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/builds/${gender}-${b}.webp${b === "average" ? "?v=5" : ""}`} alt="" width={120} height={160} loading="lazy" decoding="async"
                style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', borderRadius: 'var(--radius-sm)', opacity: on ? 1 : 0.5, transition: 'opacity var(--motion-fast) var(--ease-standard)' }} />
              <span className="t-micro" style={{ display: 'block', textAlign: 'center', textTransform: 'none', letterSpacing: 0, marginTop: 5, color: on ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)' }}>{BUILD_PRESETS[b].label}</span>
            </motion.button>
          )
        })}
      </div>
    </fieldset>
  )
}
