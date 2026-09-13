'use client'
import { Suspense, useActionState, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button, MenuItem, Notice, Page, Popover } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'
import { createDraft, saveCharacter, type DraftState } from './actions'
import { BUILD_PRESETS, BUILD_TYPES, GENDER_PRESETS, GENDER_TYPES, stageLabel } from '@miro/domain'
import { CreateHeader, TABS, type CreateTab } from './header'
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, LabeledField, Slider, Switch, TagInput } from './form-parts'

const EXAMPLES = [
  '다른 사람한텐 싸가지 없는데 나한테만 잘해주는 30살 검사',
  '같은 병원에서 일하는 무뚝뚝한 외과의',
  '내 정체를 알고도 모른 척해주는 조직의 간부',
]

type Mode = 'choose' | 'form'

export default function CreatePage() {
  // useSearchParams 는 Suspense 경계를 요구한다.
  return <Suspense fallback={null}><CreateEntry /></Suspense>
}

function CreateEntry() {
  // 내비의 시트에서 '직접 만들기' 를 고르면 ?mode=manual 로 들어온다 — 고른 것을 또 고르게 하지 않는다.
  const params = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'manual' ? 'form' : 'choose')
  const [state, action, pending] = useActionState(createDraft, { draft: null, error: null, providerNotice: null } satisfies DraftState)

  // AI 초안이 도착하면 폼으로 넘어간다 — 빈칸이 이미 채워진 상태로.
  const draft = state.draft
  if (draft && mode === 'choose') setMode('form')

  if (mode === 'choose') {
    return <Chooser onManual={() => setMode('form')} action={action} pending={pending} state={state} />
  }
  return <CreateForm draft={draft} providerNotice={state.providerNotice} />
}

/** 입구: AI 로 빠르게 만들지, 직접 채울지 고른다. */
function Chooser({ onManual, action, pending, state }: {
  onManual: () => void
  action: (f: FormData) => void
  pending: boolean
  state: DraftState
}) {
  const [examplesOpen, setExamplesOpen] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  return (
    <Page style={{ maxWidth: 560 }}>
      <h1 className="t-title-1" style={{ marginBottom: 6 }}>한 사람을 만든다</h1>
      <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
        한 문장이면 AI 가 초안을 채워 줍니다. 직접 쓰고 싶다면 빈 폼에서 시작하세요.
      </p>

      {state.providerNotice && <Notice style={{ marginBottom: 16 }}>⚠ {state.providerNotice}</Notice>}

      <form action={action} className="stack" style={{ gap: 12 }}>
        <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
          <textarea ref={ta} name="oneLiner" rows={3} required maxLength={300} placeholder="어떤 캐릭터를 원하시나요?" aria-label="캐릭터 설명"
            style={{
              width: '100%', background: 'none', border: 0, outline: 'none', resize: 'vertical',
              color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)', lineHeight: 1.6, fontFamily: 'inherit',
            }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExamplesOpen((o) => !o)} aria-expanded={examplesOpen}>예시 보기</Button>
            <Popover open={examplesOpen} onClose={() => setExamplesOpen(false)} anchor="left">
              {EXAMPLES.map((e) => (
                <MenuItem key={e} type="button" onClick={() => { if (ta.current) ta.current.value = e; setExamplesOpen(false); ta.current?.focus() }}>{e}</MenuItem>
              ))}
            </Popover>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0 }}>최대 300자</span>
          </div>
        </div>

        <AnimatePresence>
          {state.error && (
            <motion.p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter}>
              {state.error}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'}>
          {pending ? '만드는 중' : 'AI 로 초안 만들기'}
        </Button>
      </form>

      <button type="button" onClick={onManual}
        style={{
          width: '100%', minHeight: 52, marginTop: 12, borderRadius: 'var(--radius-button)',
          background: 'var(--color-surface-1)', border: 0, color: 'var(--color-text-primary)',
          fontSize: 'var(--font-body-size)', cursor: 'pointer',
        }}>
        직접 만들기
      </button>
    </Page>
  )
}

type Draft = NonNullable<DraftState['draft']>

const STAGES = ['stranger', 'acquaintance', 'professional', 'friend', 'ambiguous', 'flirting', 'rivalry', 'distrust', 'conflict', 'dating', 'lover'] as const
/**
 * 선택지용 라벨. 대화 화면의 stageLabel 은 ambiguous 와 flirting 을 일부러 같은 말('서로를 의식함')로
 * 보여주지만, 고르는 자리에서 같은 글자가 두 번 나오면 무엇을 고르는지 알 수 없다.
 */
const STAGE_PICK: Partial<Record<(typeof STAGES)[number], string>> = {
  ambiguous: '애매한 사이',
  flirting: '썸 타는 중',
}
const CHANNELS = [
  { value: 'message', label: '메시지' }, { value: 'photo', label: '사진' },
  { value: 'voice_message', label: '음성 메시지' }, { value: 'voice_call', label: '전화' },
] as const
const OUTPUT_STYLES = [
  { value: 'messenger', label: '메신저형', hint: '짧은 대사 위주. 카톡처럼.' },
  { value: 'balanced', label: '균형형', hint: '대사와 서술을 섞는다.' },
  { value: 'narrative', label: '서사형', hint: '소설처럼 길게 묘사한다.' },
] as const

/**
 * 고급 만들기 (명세서 2.2): 프로필·성격·외형·세계·관계·연락 성향을 직접 정한다.
 * 탭은 보이기만 바꾼다 — 모든 칸이 DOM 에 남아 마지막에 한 번에 제출된다.
 * AI 초안이 있으면 같은 칸이 미리 채워져 있고, 사용자는 고치기만 한다.
 */
function CreateForm({ draft, providerNotice }: { draft: Draft | null; providerNotice: string | null }) {
  const [tab, setTab] = useState<CreateTab>('profile')
  const [pending, setPending] = useState(false)

  // 필수 판정에 쓰는 값만 통제한다. 나머지는 uncontrolled — 제출 때 FormData 가 모은다.
  const [name, setName] = useState(draft?.identity.name ?? '')
  const [personality, setPersonality] = useState(draft?.personality.personality ?? '')
  const [startingContext, setStartingContext] = useState(draft?.startingContext ?? '')
  const [gender, setGender] = useState<string>(draft?.appearance.body.gender ?? 'male')
  const [build, setBuild] = useState<string>(draft?.appearance.body.build ?? 'average')
  const [stage, setStage] = useState<string>(draft?.initialRelationship.stage ?? 'stranger')
  const [contactOn, setContactOn] = useState(true)
  const [channel, setChannel] = useState<string>(draft?.contactStyle.preferredChannel ?? 'message')
  const [outputStyle, setOutputStyle] = useState('balanced')
  const [isPublic, setIsPublic] = useState(false)

  const missing = useMemo(() => {
    const m = new Set<CreateTab>()
    if (!name.trim()) m.add('profile')
    if (!personality.trim()) m.add('personality')
    if (!startingContext.trim()) m.add('intro')
    return m
  }, [name, personality, startingContext])
  const canSubmit = missing.size === 0
  const canDraft = name.trim().length > 0

  const d = draft
  const r = d?.initialRelationship
  const c = d?.contactStyle
  const a = d?.appearance

  return (
    // Page 는 transform 을 걸어 sticky 를 깨뜨리므로 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page" style={{ maxWidth: 560, paddingTop: 0, outline: 'none' }}>
      <form action={saveCharacter} onSubmit={() => setPending(true)} className="stack" style={{ gap: 0 }}>
        {d && <input type="hidden" name="draft" value={JSON.stringify(d)} />}

        <CreateHeader tab={tab} onTab={setTab} missing={missing} canSubmit={canSubmit} canDraft={canDraft} pending={pending} />
        {providerNotice && <Notice style={{ marginTop: 16 }}>⚠ {providerNotice}</Notice>}

        {/* ── 프로필 ── */}
        <Panel id="profile" show={tab === 'profile'}>
          <Section title="기본">
            <Card>
              <ImagePicker label="캐릭터 이미지" required count={0} maxCount={5} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <LabeledField label="이름" required error={name === '' ? null : undefined}>
                  <Controlled name="name" placeholder="짧은 이름이 부르기 편해요. 예) 수현" max={10} value={name} onChange={setName} big />
                </LabeledField>
                <LabeledField label="한 줄 소개" hint="카드에 이름 밑으로 걸리는 말. 캐릭터가 직접 하는 말이면 좋습니다.">
                  <CountedInput name="title" placeholder="예) 만지지 마십시오. …그건, 아직 당신 것이 아닙니다." max={40} defaultValue="" />
                </LabeledField>
                <Two>
                  <LabeledField label="나이"><CountedInput name="age" placeholder="예) 32" max={3} defaultValue={d?.identity.age ? String(d.identity.age) : ''} /></LabeledField>
                  <LabeledField label="MBTI"><CountedInput name="mbti" placeholder="예) INTJ" max={4} defaultValue={d?.identity.mbti ?? ''} /></LabeledField>
                </Two>
                <Two>
                  <LabeledField label="국적"><CountedInput name="nationality" placeholder="예) 영국" max={40} defaultValue={d?.identity.nationality ?? ''} /></LabeledField>
                  <LabeledField label="직업"><CountedInput name="occupation" placeholder="예) 고서 복원가" max={60} defaultValue={d?.identity.occupation ?? ''} /></LabeledField>
                </Two>
              </div>
            </Card>
          </Section>
          <Section title="자리">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="역할" hint="카드에 짧게 붙는 한 단어. 예) 복원가, 검사, 간부">
                  <CountedInput name="role" placeholder="예) 복원가" max={30} defaultValue={d?.presentation.role ?? ''} />
                </LabeledField>
                <LabeledField label="사회적 위치" hint="이 사람이 세계 안에서 서 있는 자리.">
                  <CountedInput name="socialPosition" placeholder="예) 런던 구시가지 복원 공방의 주인" max={80} defaultValue={d?.socialPosition ?? ''} />
                </LabeledField>
                <LabeledField label="나를 부르는 호칭" hint="비워 두면 상황에 맞게 부릅니다.">
                  <CountedInput name="userNickname" placeholder="예) 손님, 너, 이름" max={20} defaultValue="" />
                </LabeledField>
              </div>
            </Card>
          </Section>
        </Panel>

        {/* ── 성격 ── */}
        <Panel id="personality" show={tab === 'personality'}>
          <Section title="성격">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="어떤 사람인가요" required>
                  <ControlledArea name="personality" value={personality} onChange={setPersonality} max={600} rows={5}
                    placeholder={'특징, 행동, 감정 표현을 적어주시면 개성이 살아납니다.\n예) 감정을 드러내지 않고 거리를 둔다. 예의는 갖추지만 다정하지는 않다.'} />
                </LabeledField>
                <LabeledField label="가치관"><CountedTextArea name="values" max={300} rows={2} defaultValue={d?.personality.values ?? ''} placeholder="예) 약속과 원칙. 말보다 행동으로 증명하는 것." /></LabeledField>
                <LabeledField label="말투"><CountedTextArea name="speechStyle" max={300} rows={2} defaultValue={d?.personality.speechStyle ?? ''} placeholder="예) 존대. 문장이 짧고 군더더기가 없다. 감탄사를 거의 쓰지 않는다." /></LabeledField>
              </div>
            </Card>
          </Section>
          <Section title="취향">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="좋아하는 것"><TagInput name="hobbies" placeholder="예) 고서 수집" max={6} defaultValue={d?.personality.hobbies ?? []} /></LabeledField>
                <LabeledField label="싫어하는 것"><TagInput name="dislikes" placeholder="예) 무례함" max={6} defaultValue={d?.personality.dislikes ?? []} /></LabeledField>
              </div>
            </Card>
          </Section>
          <Section title="성향" subtitle="같은 말에도 캐릭터마다 다르게 반응하게 하는 값입니다.">
            <Card>
              <div className="stack" style={{ gap: 20 }}>
                <Slider name="jealousy" label="질투" defaultValue={d?.personality.jealousy ?? 50} lo="무던함" hi="예민함" />
                <Slider name="initiative" label="주도성" defaultValue={d?.personality.initiative ?? 50} lo="기다림" hi="먼저 다가감" />
                <Slider name="emotionalExpression" label="감정 표현" defaultValue={d?.personality.emotionalExpression ?? 50} lo="숨김" hi="드러냄" />
              </div>
            </Card>
          </Section>
        </Panel>

        {/* ── 외형 ── */}
        <Panel id="appearance" show={tab === 'appearance'}>
          <Section title="몸" subtitle="사진·Live Scene·영상통화가 전부 이 값으로 같은 사람을 그립니다.">
            <Card>
              <BodyPicker build={build} onBuild={setBuild} gender={gender} onGender={setGender} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <Two>
                  <LabeledField label="키"><CountedInput name="height" placeholder="예) 186cm" max={20} defaultValue={a?.body.height ?? ''} /></LabeledField>
                  <LabeledField label="체형 설명"><CountedInput name="detail" placeholder="예) 어깨가 넓다" max={120} defaultValue={a?.body.detail ?? ''} /></LabeledField>
                </Two>
              </div>
            </Card>
          </Section>
          <Section title="얼굴">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="눈"><CountedInput name="eyes" placeholder="예) 깊고 차가운 회청색 눈" max={80} defaultValue={a?.baseFace.eyes ?? ''} /></LabeledField>
                <Two>
                  <LabeledField label="코"><CountedInput name="nose" placeholder="예) 곧고 높은 콧대" max={80} defaultValue={a?.baseFace.nose ?? ''} /></LabeledField>
                  <LabeledField label="턱"><CountedInput name="jaw" placeholder="예) 선이 분명한 턱" max={80} defaultValue={a?.baseFace.jaw ?? ''} /></LabeledField>
                </Two>
                <LabeledField label="피부"><CountedInput name="skin" placeholder="예) 창백하고 건조한 피부" max={80} defaultValue={a?.baseFace.skin ?? ''} /></LabeledField>
                <LabeledField label="알아보게 하는 특징" hint="흉터, 점, 문신처럼 그 사람을 알아보게 하는 한 가지.">
                  <CountedInput name="distinctive" placeholder="예) 왼쪽 눈썹 끝을 가로지르는 오래된 흉터" max={100} defaultValue={a?.baseFace.distinctive ?? ''} />
                </LabeledField>
              </div>
            </Card>
          </Section>
          <Section title="머리 · 인상">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <Two>
                  <LabeledField label="머리 색"><CountedInput name="hairColor" placeholder="예) 어두운 갈색" max={40} defaultValue={a?.hair.color ?? ''} /></LabeledField>
                  <LabeledField label="머리 길이"><CountedInput name="hairLength" placeholder="예) 짧고 단정한" max={40} defaultValue={a?.hair.length ?? ''} /></LabeledField>
                </Two>
                <LabeledField label="머리 스타일"><CountedInput name="hairStyle" placeholder="예) 이마를 드러내게 넘긴" max={60} defaultValue={a?.hair.style ?? ''} /></LabeledField>
                <LabeledField label="평소 표정"><CountedInput name="expression" placeholder="예) 표정 변화가 거의 없다" max={120} defaultValue={a?.expression ?? ''} /></LabeledField>
                <LabeledField label="스타일 태그" hint="옷차림·분위기. 사진 생성이 읽습니다.">
                  <TagInput name="styleTags" placeholder="예) 소매를 걷어 올린 셔츠" max={5} maxLength={40} defaultValue={a?.styleTags ?? []} />
                </LabeledField>
              </div>
            </Card>
          </Section>
        </Panel>

        {/* ── 세계 ── */}
        <Panel id="world" show={tab === 'world'}>
          <Section title="세계">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <Two>
                  <LabeledField label="시대"><CountedInput name="era" placeholder="예) 현대" max={40} defaultValue={d?.world.era ?? ''} /></LabeledField>
                  <LabeledField label="장르"><CountedInput name="genre" placeholder="예) 현대 드라마 · 미스터리" max={60} defaultValue={d?.world.genre ?? ''} /></LabeledField>
                </Two>
                <LabeledField label="장소"><CountedInput name="location" placeholder="예) 런던 구시가지" max={60} defaultValue={d?.world.location ?? ''} /></LabeledField>
                <LabeledField label="세계관">
                  <CountedTextArea name="worldSetting" max={600} rows={5} defaultValue={d?.world.worldSetting ?? ''}
                    placeholder="상황, 관계, 세계관 등을 설명해주세요." />
                </LabeledField>
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
              <div className="stack" style={{ gap: 20, marginTop: 'var(--space-5)' }}>
                <Slider name="trust" label="신뢰" defaultValue={r?.trust ?? 30} lo="의심" hi="믿음" />
                <Slider name="attraction" label="호감" defaultValue={r?.attraction ?? 10} lo="무관심" hi="끌림" />
                <Slider name="emotionalDistance" label="정서적 거리" defaultValue={r?.emotionalDistance ?? 60} lo="가까움" hi="멂" />
                <Slider name="attachment" label="애착" defaultValue={r?.attachment ?? 10} lo="없음" hi="강함" />
                <Slider name="protectiveness" label="보호 성향" defaultValue={r?.protectiveness ?? 20} lo="방관" hi="개입" />
                <Slider name="relJealousy" label="질투 (관계)" defaultValue={r?.jealousy ?? 0} lo="없음" hi="강함" />
              </div>
            </Card>
          </Section>
          <Section title="관계 키워드" subtitle="카드와 상세에 해시태그로 붙습니다.">
            <Card>
              <TagInput name="relationshipKeywords" placeholder="예) 거리를 두는" max={4} defaultValue={d?.presentation.relationshipKeywords ?? []} />
            </Card>
          </Section>
        </Panel>

        {/* ── 연락 ── */}
        <Panel id="contact" show={tab === 'contact'}>
          <Section title="앱 밖에서">
            <Card>
              <Switch name="contactEnabled" checked={contactOn} onChange={setContactOn}
                label="먼저 연락하기"
                hint="앱을 닫아도 캐릭터가 상황과 성격에 맞춰 먼저 메시지·사진·통화를 보냅니다." />
            </Card>
          </Section>
          {contactOn && (
            <>
              <Section title="얼마나">
                <Card>
                  <div className="stack" style={{ gap: 20 }}>
                    <Slider name="contactFrequency" label="연락 빈도" defaultValue={c?.contactFrequency ?? 50} lo="드물게" hi="자주" />
                    <Slider name="initiativeLevel" label="주도성" defaultValue={c?.initiativeLevel ?? 50} lo="기다림" hi="먼저" />
                    <LabeledField label="답장까지 걸리는 시간 (분)">
                      <CountedInput name="replyDelayMinutes" placeholder="예) 5" max={4} defaultValue={String(c?.replyDelayMinutes ?? 5)} />
                    </LabeledField>
                    <Two>
                      <LabeledField label="활동 시작"><TimeInput name="activeHoursStart" defaultValue={c?.activeHoursStart ?? '08:00'} /></LabeledField>
                      <LabeledField label="활동 종료"><TimeInput name="activeHoursEnd" defaultValue={c?.activeHoursEnd ?? '23:00'} /></LabeledField>
                    </Two>
                  </div>
                </Card>
              </Section>
              <Section title="어떻게">
                <Card>
                  <LabeledField label="선호 채널">
                    <ChoiceChips name="preferredChannel" value={channel} onChange={setChannel} options={[...CHANNELS]} columns={4} />
                  </LabeledField>
                  <div className="stack" style={{ gap: 20, marginTop: 'var(--space-5)' }}>
                    <Slider name="photoProbability" label="사진" defaultValue={c?.photoProbability ?? 20} lo="거의 안 함" hi="자주" />
                    <Slider name="voiceMessageProbability" label="음성 메시지" defaultValue={c?.voiceMessageProbability ?? 20} lo="거의 안 함" hi="자주" />
                    <Slider name="callProbability" label="전화" defaultValue={c?.callProbability ?? 30} lo="거의 안 함" hi="자주" />
                    <Slider name="videoCallProbability" label="영상통화" defaultValue={c?.videoCallProbability ?? 10} lo="거의 안 함" hi="자주" />
                  </div>
                </Card>
              </Section>
              <Section title="세계 안에서 보이는 모습" subtitle="같은 기능도 세계관에 맞게 다르게 보입니다.">
                <Card>
                  <LabeledField label="발신자 표시" hint="예) 히사시는 '알 수 없는 번호', 토마스는 '편지'.">
                    <CountedInput name="senderLabel" placeholder="비워 두면 이름으로 옵니다" max={30} defaultValue="" />
                  </LabeledField>
                </Card>
              </Section>
            </>
          )}
        </Panel>

        {/* ── 인트로 ── */}
        <Panel id="intro" show={tab === 'intro'}>
          <Section title="첫 장면" subtitle="대화가 시작되는 장면입니다.">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="첫 장면" required>
                  <ControlledArea name="startingContext" value={startingContext} onChange={setStartingContext} max={600} rows={4}
                    placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
                </LabeledField>
                <LabeledField label="시작 시간"><CountedInput name="startingTime" placeholder="예) 저녁" max={20} defaultValue={d?.startingTime ?? ''} /></LabeledField>
              </div>
            </Card>
          </Section>
          <Section title="상황 예시" subtitle="이 캐릭터와의 대화가 어떤 느낌인지 보여줍니다. 상세 페이지에 실립니다.">
            <Card>
              <DialogueEditor name="sampleDialogue" characterName={name} />
            </Card>
          </Section>
        </Panel>

        {/* ── 설정 ── */}
        <Panel id="settings" show={tab === 'settings'}>
          <Section title="역할극 스타일" subtitle="대화 중에도 바꿀 수 있습니다.">
            <Card>
              <input type="hidden" name="outputStyle" value={outputStyle} />
              <div className="stack" style={{ gap: 8 }}>
                {OUTPUT_STYLES.map((o) => {
                  const on = o.value === outputStyle
                  return (
                    <button key={o.value} type="button" onClick={() => setOutputStyle(o.value)} aria-pressed={on}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', textAlign: 'left',
                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                        border: `1.5px solid ${on ? 'var(--color-accent)' : 'transparent'}`,
                      }}>
                      <span className="stack" style={{ gap: 2, flex: 1 }}>
                        <span className="t-body" style={{ color: on ? 'var(--color-accent-text)' : 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>{o.label}</span>
                        <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{o.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          </Section>
          <Section title="공개" subtitle="켜면 홈과 발견에 실리고, 다른 사람이 이 캐릭터와 대화를 시작할 수 있습니다.">
            <Card>
              <Switch name="isPublic" checked={isPublic} onChange={setIsPublic}
                label="다른 사람에게 공개"
                hint="임시저장은 공개되지 않습니다. 대화 내용은 각자 따로 — 다른 사람의 대화가 내게 보이지 않습니다." />
            </Card>
          </Section>
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

/** 칸을 묶는 판. 페이지 바닥보다 한 단 밝다. */
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5) var(--space-4)' }}>{children}</div>
}

function Two({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function TimeInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <input name={name} type="time" defaultValue={defaultValue}
      style={{ width: '100%', padding: '6px 0 10px', background: 'none', border: 0, outline: 'none', borderBottom: '1.5px solid var(--color-border-strong)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)', colorScheme: 'dark' }} />
  )
}

/** 값을 바깥이 들고 있는 한 줄 입력 (필수 판정용). 밑줄만, 상자 없음. */
function Controlled({ name, placeholder, max, value, onChange, big }: {
  name: string; placeholder: string; max: number; value: string; onChange: (v: string) => void; big?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 10px',
      borderBottom: `1.5px solid ${focused ? 'var(--color-white)' : 'var(--color-border-strong)'}`, transition: 'border-color var(--motion-fast) var(--ease-standard)' }}>
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: big ? 'var(--font-title-3)' : 'var(--font-body-lg)' }} />
      {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
    </div>
  )
}

function ControlledArea({ name, placeholder, max, rows, value, onChange }: {
  name: string; placeholder: string; max: number; rows: number; value: string; onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: '6px 0 8px', borderBottom: `1.5px solid ${focused ? 'var(--color-white)' : 'var(--color-border-strong)'}`, transition: 'border-color var(--motion-fast) var(--ease-standard)' }}>
      <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)', lineHeight: 1.6, fontFamily: 'inherit' }} />
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
        {BUILD_TYPES.map((b) => {
          const on = b === build
          return (
            <motion.button key={b} type="button" onClick={() => onBuild(b)} aria-pressed={on}
              aria-label={`${GENDER_PRESETS[gender as keyof typeof GENDER_PRESETS]?.label} ${BUILD_PRESETS[b].label}`}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{ padding: 3, cursor: 'pointer', borderRadius: 'var(--radius-md)', background: 'none', border: `1.5px solid ${on ? 'var(--color-accent)' : 'transparent'}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/builds/${gender}-${b}.webp`} alt="" width={120} height={160} loading="lazy" decoding="async"
                style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', borderRadius: 'var(--radius-sm)', opacity: on ? 1 : 0.5, transition: 'opacity var(--motion-fast) var(--ease-standard)' }} />
              <span className="t-micro" style={{ display: 'block', textAlign: 'center', textTransform: 'none', letterSpacing: 0, marginTop: 5, color: on ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)' }}>{BUILD_PRESETS[b].label}</span>
            </motion.button>
          )
        })}
      </div>
    </fieldset>
  )
}
