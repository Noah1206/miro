'use client'
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Tip } from '@/components/ui'
import { saveCharacter } from './actions'
import { BUILD_PRESETS, BUILD_TYPES, GENDER_PRESETS, GENDER_TYPES, stageLabel } from '@miro/domain'
import { CreateHeader, type CreateTab } from './header'
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, LabeledField, Rows, Stepped, Switch, TagInput, box, type Step } from './form-parts'

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
  // 4열 칩이라 '음성 메시지' 는 두 줄로 꺾인다 — 칩만 짧게. 아래 항목 제목은 온전한 이름을 쓴다.
  { value: 'voice_message', label: '음성' }, { value: 'voice_call', label: '전화' },
] as const
const OUTPUT_STYLES = [
  { value: 'messenger', label: '메신저형', hint: '짧은 대사 위주. 카톡처럼.' },
  { value: 'balanced', label: '균형형', hint: '대사와 서술을 섞는다.' },
  { value: 'narrative', label: '서사형', hint: '소설처럼 길게 묘사한다.' },
] as const


/**
 * 단계 정의. 값은 0–100 그대로 저장되고, 라벨·설명만 사람 말이다.
 * 연락 빈도의 시간은 엔진 공식(72h − 빈도×0.66h)에서 역산한 실제 값이다.
 */
const S = {
  jealousy: [
    { value: 15, label: '무던함', hint: '다른 사람 얘기가 나와도 별 반응이 없어요.' },
    { value: 45, label: '보통', hint: '가끔 신경은 쓰지만 티를 잘 안 내요.' },
    { value: 70, label: '예민함', hint: '다른 사람 이야기에 민감하게 반응해요.' },
    { value: 90, label: '아주 예민함', hint: '작은 것에도 바로 마음이 상해요.' },
  ],
  initiative: [
    { value: 15, label: '기다림', hint: '먼저 다가오지 않아요. 당신이 움직여야 해요.' },
    { value: 45, label: '보통', hint: '상황에 따라 먼저 말을 걸기도 해요.' },
    { value: 70, label: '먼저 다가감', hint: '관심이 생기면 먼저 다가와요.' },
    { value: 90, label: '적극적', hint: '주저 없이 먼저 움직여요.' },
  ],
  emotionalExpression: [
    { value: 15, label: '숨김', hint: '감정을 거의 드러내지 않아요.' },
    { value: 40, label: '절제', hint: '느끼지만 말로는 잘 안 해요.' },
    { value: 65, label: '드러냄', hint: '기분이 표정과 말에 묻어나요.' },
    { value: 90, label: '솔직함', hint: '느끼는 대로 바로 말해요.' },
  ],
  trust: [
    { value: 10, label: '의심', hint: '당신 말을 곧이곧대로 믿지 않아요.' },
    { value: 30, label: '조심', hint: '아직 경계를 풀지 않았어요.' },
    { value: 55, label: '보통', hint: '어느 정도는 믿어요.' },
    { value: 80, label: '믿음', hint: '당신 말을 믿고 따라요.' },
  ],
  attraction: [
    { value: 5, label: '무관심', hint: '당신을 특별히 의식하지 않아요.' },
    { value: 25, label: '약간', hint: '조금 신경은 쓰여요.' },
    { value: 50, label: '호감', hint: '당신에게 호감이 있어요.' },
    { value: 75, label: '끌림', hint: '이미 마음이 기울었어요.' },
  ],
  emotionalDistance: [
    { value: 20, label: '가까움', hint: '편안하게 대해요.' },
    { value: 45, label: '보통', hint: '예의는 지키되 벽은 없어요.' },
    { value: 65, label: '거리 둠', hint: '아직 거리를 두고 쉽게 마음을 열지 않아요.' },
    { value: 85, label: '멂', hint: '당신을 낯선 사람으로 대해요.' },
  ],
  attachment: [
    { value: 5, label: '없음', hint: '당신이 없어도 아무렇지 않아요.' },
    { value: 25, label: '약함', hint: '가끔 생각은 나요.' },
    { value: 50, label: '있음', hint: '당신을 신경 써요. 오래 조용하면 먼저 연락할 수 있어요.' },
    { value: 80, label: '강함', hint: '당신이 없으면 허전해요.' },
  ],
  protectiveness: [
    { value: 10, label: '방관', hint: '당신 일에 끼어들지 않아요.' },
    { value: 35, label: '보통', hint: '위험해 보이면 한마디는 해요.' },
    { value: 60, label: '챙김', hint: '당신을 챙기려 해요.' },
    { value: 85, label: '개입', hint: '위험해 보이면 먼저 나서서 막아요.' },
  ],
  relJealousy: [
    { value: 0, label: '없음', hint: '질투는 아직 없어요.' },
    { value: 25, label: '약함', hint: '살짝 신경 쓰이는 정도예요.' },
    { value: 50, label: '있음', hint: '다른 사람 얘기에 반응해요.' },
    { value: 80, label: '강함', hint: '드러내 놓고 질투해요.' },
  ],
  contactFrequency: [
    { value: 20, label: '드물게', hint: '조용하면 약 2.5일 뒤에 먼저 연락해요.' },
    { value: 45, label: '가끔', hint: '조용하면 약 1.7일 뒤에 먼저 연락해요.' },
    { value: 70, label: '자주', hint: '조용하면 약 하루 뒤에 먼저 연락해요.' },
    { value: 90, label: '매우 자주', hint: '조용하면 반나절이면 먼저 연락해요.' },
  ],
  initiativeLevel: [
    { value: 20, label: '기다림', hint: '연락은 주로 당신이 먼저 해요.' },
    { value: 50, label: '보통', hint: '이유가 있으면 먼저 연락해요.' },
    { value: 80, label: '먼저', hint: '먼저 연락하는 쪽이에요.' },
  ],
  media: [
    { value: 5, label: '거의 안 함', hint: '이 방법으로는 거의 연락하지 않아요.' },
    { value: 25, label: '가끔', hint: '어쩌다 한 번 써요.' },
    { value: 50, label: '자주', hint: '종종 이 방법을 골라요.' },
    { value: 80, label: '매우 자주', hint: '즐겨 쓰는 방법이에요.' },
  ],
} as const satisfies Record<string, readonly Step[]>

/**
 * 고급 만들기 (명세서 2.2): 프로필·성격·외형·세계·관계·연락 성향을 직접 정한다.
 * 탭은 보이기만 바꾼다 — 모든 칸이 DOM 에 남아 마지막에 한 번에 제출된다.
 */
export default function CreatePage() {
  const [tab, setTab] = useState<CreateTab>('profile')
  const [pending, setPending] = useState(false)

  // 필수 판정에 쓰는 값만 통제한다. 나머지는 uncontrolled — 제출 때 FormData 가 모은다.
  const [name, setName] = useState('')
  const [personality, setPersonality] = useState('')
  const [startingContext, setStartingContext] = useState('')
  const [gender, setGender] = useState<string>('male')
  const [build, setBuild] = useState<string>('average')
  const [stage, setStage] = useState<string>('stranger')
  const [contactOn, setContactOn] = useState(true)
  const [channel, setChannel] = useState<string>('message')
  const [outputStyle, setOutputStyle] = useState('balanced')
  const [isPublic, setIsPublic] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  const missing = useMemo(() => {
    const m = new Set<CreateTab>()
    if (!name.trim()) m.add('profile')
    if (!personality.trim()) m.add('personality')
    if (!startingContext.trim()) m.add('intro')
    return m
  }, [name, personality, startingContext])
  const canSubmit = missing.size === 0
  const canDraft = name.trim().length > 0


  return (
    // Page 는 transform 을 걸어 sticky 를 깨뜨리므로 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page" style={{ maxWidth: 560, paddingTop: 0, outline: 'none' }}>
      <form action={saveCharacter} onSubmit={() => setPending(true)} className="stack" style={{ gap: 0 }}>

        <CreateHeader tab={tab} onTab={setTab} canSubmit={canSubmit} canDraft={canDraft} pending={pending} />
        <Tip id="create" style={{ marginTop: 'var(--space-4)' }}>이름·성격·첫 장면만 채우면 등록할 수 있어요. 나머지는 나중에 고쳐도 됩니다.</Tip>

        {/* ── 프로필 ── */}
        <Panel id="profile" show={tab === 'profile'}>
          <Section title="캐릭터">
            <Card>
              {/* 저장소가 없어 아직 미리보기만 된다 — 저장되지 않는 것을 필수로 막을 수는 없다. 업로드가 생기면 required 로. */}
              <ImagePicker label="캐릭터 이미지" count={0} maxCount={5} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <LabeledField label="이름" required error={name === '' ? null : undefined}>
                  <Controlled name="name" placeholder="짧은 이름이 부르기 편해요. 예) 수현" max={10} value={name} onChange={setName} big />
                </LabeledField>
                <LabeledField label="설명" hint="세계 탭의 시대·장르·장소와 함께 세계관이 된다.">
                  <CountedTextArea name="worldSetting" max={600} rows={3} defaultValue={''}
                    placeholder="상황, 관계, 세계관 등을 설명해주세요." />
                </LabeledField>
                <Two>
                  <LabeledField label="나이"><CountedInput name="age" placeholder="예) 32" max={3} defaultValue="" /></LabeledField>
                  <LabeledField label="MBTI"><CountedInput name="mbti" placeholder="예) INTJ" max={4} defaultValue={''} /></LabeledField>
                </Two>
                <Two>
                  <LabeledField label="국적"><CountedInput name="nationality" placeholder="예) 영국" max={40} defaultValue={''} /></LabeledField>
                  <LabeledField label="직업"><CountedInput name="occupation" placeholder="예) 고서 복원가" max={60} defaultValue={''} /></LabeledField>
                </Two>
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
          <Section title="취향">
            <Card>
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="좋아하는 것"><TagInput name="hobbies" placeholder="예) 고서 수집" max={6} defaultValue={[]} /></LabeledField>
                <LabeledField label="싫어하는 것"><TagInput name="dislikes" placeholder="예) 무례함" max={6} defaultValue={[]} /></LabeledField>
              </div>
            </Card>
          </Section>
          <Section title="성향" subtitle="같은 말에도 캐릭터마다 다르게 반응하게 하는 값입니다.">
            <Card>
              <Rows>
                <Stepped name="jealousy" label="질투" defaultValue={50} options={S.jealousy} />
                <Stepped name="initiative" label="주도성" defaultValue={50} options={S.initiative} />
                <Stepped name="emotionalExpression" label="감정 표현" defaultValue={50} options={S.emotionalExpression} />
              </Rows>
            </Card>
          </Section>
        </Panel>

        {/* ── 외형 ── */}
        <Panel id="appearance" show={tab === 'appearance'}>
          <Section title="몸" subtitle="사진·Live Scene·영상통화가 전부 이 값으로 같은 사람을 그립니다.">
            <Card>
              <BodyPicker build={build} onBuild={setBuild} gender={gender} onGender={setGender} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <LabeledField label="키"><CountedInput name="height" placeholder="예) 186cm" max={20} defaultValue={''} /></LabeledField>
                <LabeledField label="체형 설명"><CountedInput name="detail" placeholder="예) 어깨가 넓다" max={120} defaultValue={''} /></LabeledField>
              </div>

              {/* 얼굴·머리는 고급 — 몸만 정해도 사진은 나온다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}>
                <button type="button" aria-expanded={advanced} aria-controls="appearance-advanced" onClick={() => setAdvanced((v) => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 999, cursor: 'pointer',
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)',
                    color: 'var(--color-text-primary)', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-medium)',
                  }}>
                  고급 설정
                  <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none"
                    style={{ transform: advanced ? 'rotate(180deg)' : 'none', transition: 'transform var(--motion-fast) var(--ease-standard)' }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div id="appearance-advanced" hidden={!advanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>얼굴</p>
                  <LabeledField label="눈"><CountedInput name="eyes" placeholder="예) 깊고 차가운 회청색 눈" max={80} defaultValue={''} /></LabeledField>
                  <Two>
                    <LabeledField label="코"><CountedInput name="nose" placeholder="예) 곧고 높은 콧대" max={80} defaultValue={''} /></LabeledField>
                    <LabeledField label="턱"><CountedInput name="jaw" placeholder="예) 선이 분명한 턱" max={80} defaultValue={''} /></LabeledField>
                  </Two>
                  <LabeledField label="피부"><CountedInput name="skin" placeholder="예) 창백하고 건조한 피부" max={80} defaultValue={''} /></LabeledField>
                  <LabeledField label="알아보게 하는 특징" hint="흉터, 점, 문신처럼 그 사람을 알아보게 하는 한 가지.">
                    <CountedInput name="distinctive" placeholder="예) 왼쪽 눈썹 끝을 가로지르는 오래된 흉터" max={100} defaultValue={''} />
                  </LabeledField>

                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginTop: 'var(--space-2)' }}>머리 · 인상</p>
                  <Two>
                    <LabeledField label="머리 색"><CountedInput name="hairColor" placeholder="예) 어두운 갈색" max={40} defaultValue={''} /></LabeledField>
                    <LabeledField label="머리 길이"><CountedInput name="hairLength" placeholder="예) 짧고 단정한" max={40} defaultValue={''} /></LabeledField>
                  </Two>
                  <LabeledField label="머리 스타일"><CountedInput name="hairStyle" placeholder="예) 이마를 드러내게 넘긴" max={60} defaultValue={''} /></LabeledField>
                  <LabeledField label="평소 표정"><CountedInput name="expression" placeholder="예) 표정 변화가 거의 없다" max={120} defaultValue={''} /></LabeledField>
                  <LabeledField label="스타일 태그" hint="옷차림·분위기. 사진 생성이 읽습니다.">
                    <TagInput name="styleTags" placeholder="예) 소매를 걷어 올린 셔츠" max={5} maxLength={40} defaultValue={[]} />
                  </LabeledField>
                </div>
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
                  <LabeledField label="시대"><CountedInput name="era" placeholder="예) 현대" max={40} defaultValue={''} /></LabeledField>
                  <LabeledField label="장르"><CountedInput name="genre" placeholder="예) 현대 드라마 · 미스터리" max={60} defaultValue={''} /></LabeledField>
                </Two>
                <LabeledField label="장소"><CountedInput name="location" placeholder="예) 런던 구시가지" max={60} defaultValue={''} /></LabeledField>
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
                <Stepped name="trust" label="신뢰" defaultValue={30} options={S.trust} />
                <Stepped name="attraction" label="호감" defaultValue={10} options={S.attraction} />
                <Stepped name="emotionalDistance" label="정서적 거리" defaultValue={60} options={S.emotionalDistance} />
                <Stepped name="attachment" label="애착" defaultValue={10} options={S.attachment} />
                <Stepped name="protectiveness" label="보호 성향" defaultValue={20} options={S.protectiveness} />
                <Stepped name="relJealousy" label="질투 (관계)" defaultValue={0} options={S.relJealousy} />
              </Rows>
            </Card>
          </Section>
          <Section title="관계 키워드" subtitle="카드와 상세에 해시태그로 붙습니다.">
            <Card>
              <TagInput name="relationshipKeywords" placeholder="예) 거리를 두는" max={4} defaultValue={[]} />
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
                  <Rows>
                    <Stepped name="contactFrequency" label="연락 빈도" defaultValue={50} options={S.contactFrequency} />
                    <Stepped name="initiativeLevel" label="주도성" defaultValue={50} options={S.initiativeLevel} />
                    <LabeledField label="답장까지 걸리는 시간 (분)">
                      <CountedInput name="replyDelayMinutes" placeholder="예) 5" max={4} defaultValue={String(5)} />
                    </LabeledField>
                    <Two>
                      <LabeledField label="활동 시작"><TimeInput name="activeHoursStart" defaultValue={'08:00'} /></LabeledField>
                      <LabeledField label="활동 종료"><TimeInput name="activeHoursEnd" defaultValue={'23:00'} /></LabeledField>
                    </Two>
                  </Rows>
                </Card>
              </Section>
              <Section title="어떻게">
                <Card>
                  <LabeledField label="선호 채널">
                    <ChoiceChips name="preferredChannel" value={channel} onChange={setChannel} options={[...CHANNELS]} columns={4} />
                  </LabeledField>
                  <Rows style={{ marginTop: 'var(--space-5)' }}>
                    <Stepped name="photoProbability" label="사진" defaultValue={20} options={S.media} />
                    <Stepped name="voiceMessageProbability" label="음성 메시지" defaultValue={20} options={S.media} />
                    <Stepped name="callProbability" label="전화" defaultValue={30} options={S.media} />
                    <Stepped name="videoCallProbability" label="영상통화" defaultValue={10} options={S.media} />
                  </Rows>
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
                  <ControlledArea name="startingContext" value={startingContext} onChange={setStartingContext} max={600} rows={3}
                    placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
                </LabeledField>
                <LabeledField label="시작 시간"><CountedInput name="startingTime" placeholder="예) 저녁" max={20} defaultValue={''} /></LabeledField>
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
  return <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>{children}</div>
}

/** 좌우 두 칸. 1fr 은 최소 폭이 입력 고유 폭에 잡혀 오른쪽 칸이 카드를 넘친다 — minmax(0,1fr) 로 눌러야 한다. */
function Two({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>{children}</div>
}

function TimeInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <input name={name} type="time" defaultValue={defaultValue}
      style={{ width: '100%', padding: '6px 10px', outline: 'none', color: 'var(--color-text-primary)', fontSize: 14, colorScheme: 'dark', ...box(false) }} />
  )
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
