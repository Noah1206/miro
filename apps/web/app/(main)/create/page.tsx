'use client'
import { Suspense, useActionState, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Accordion, Button, MenuItem, Notice, Page, Popover } from '@/components/ui'
import { duration, ease, tween } from '@/lib/motion/tokens'
import { createDraft, saveCharacter, type DraftState } from './actions'
import { BUILD_PRESETS, BUILD_TYPES, GENDER_PRESETS, GENDER_TYPES } from '@miro/domain'
import { CreateHeader, STEPS, type CreateStep } from './header'
import { CountedInput, CountedTextArea, ImagePicker, LabeledField } from './form-parts'

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

/**
 * 단계형 만들기.
 *
 * 레퍼런스는 탭 하나에 모든 칸을 쌓아 두지만 여기서는 한 화면에 한 가지만 묻는다:
 * 누구인가 → 어디에 사는가 → 어떻게 만나는가. 각 단계는 큰 질문 하나로 열리고,
 * 덜 중요한 칸은 '자세히' 안에 접힌다. 모든 칸은 DOM 에 남아 있으므로 마지막에 한 번에 제출된다.
 */
function CreateForm({ draft, providerNotice }: { draft: Draft | null; providerNotice: string | null }) {
  const [index, setIndex] = useState(0)
  const [name, setName] = useState(draft?.identity.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [title, setTitle] = useState('')
  const [build, setBuild] = useState<string>(draft?.appearance.body.build ?? 'average')
  const [gender, setGender] = useState<string>(draft?.appearance.body.gender ?? 'male')
  const reduce = useReducedMotion()

  const step: CreateStep = STEPS[index]!.key
  // 첫 단계는 이름이 있어야 넘어간다. 나머지는 비워 둔 채 지나갈 수 있다 — 나중에 고칠 수 있으니까.
  const canAdvance = step === 'who' ? name.trim().length > 0 : true
  const canSubmit = name.trim().length > 0 && title.trim().length > 0
  const last = index === STEPS.length - 1

  return (
    // Page 는 등장 애니메이션으로 transform 을 건다 — transform 된 조상 안에서는 sticky 가
    // 뷰포트가 아니라 그 조상에 붙어 머리가 화면 중간에 떠 버린다. 그래서 여기서는 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page" style={{ maxWidth: 560, paddingTop: 0, outline: 'none' }}>
      <form action={saveCharacter} className="stack" style={{ gap: 0 }}>
        {draft && <input type="hidden" name="draft" value={JSON.stringify(draft)} />}
        <input type="hidden" name="build" value={build} />
        <input type="hidden" name="gender" value={gender} />

        <CreateHeader index={index} onBack={() => setIndex((i) => Math.max(0, i - 1))} />

        {providerNotice && <Notice style={{ marginTop: 16 }}>⚠ {providerNotice}</Notice>}

        {/* 질문이 먼저 온다 — 칸보다 크게. */}
        <motion.h1 key={step} className="t-title-1"
          initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: ease.enter }}
          style={{ margin: 'var(--space-6) 0 var(--space-5)' }}>
          {/* 단계 위치는 화면에 띄우지 않되 제목과 함께 읽히게 한다 — 막대를 없앴으므로 여기가 유일한 자리다. */}
          <span className="sr-only">{STEPS.length}단계 중 {index + 1}단계. </span>
          {QUESTION[step]}
        </motion.h1>

        {/* 단계는 보이기만 바뀐다. DOM 에서 빼면 앞 단계에 쓴 값이 사라진다. */}
        <StepPanel show={step === 'who'}>
          <Card>
            <ImagePicker label="캐릭터 이미지" count={0} maxCount={5} />
            <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
              <LabeledField label="이름" required error={nameTouched && !name.trim() ? '이름을 입력해주세요' : null}>
                <ControlledInput name="name" placeholder="짧은 이름이 부르기 편해요. 예) 수현" max={10}
                  value={name} onChange={(v) => { setName(v); setNameTouched(true) }}
                  invalid={nameTouched && !name.trim()} />
              </LabeledField>
              <LabeledField label="어떤 사람인가요">
                <CountedTextArea name="personality" max={600} rows={4}
                  defaultValue={draft?.personality.personality ?? ''}
                  placeholder={'특징, 행동, 감정 표현을 적어주시면 개성이 살아납니다.\n예) 말이 짧고 군더더기가 없다. 감탄사를 거의 쓰지 않는다.'} />
              </LabeledField>
            </div>
          </Card>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Accordion title="자세히">
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="말투">
                  <CountedInput name="speechStyle" placeholder="예) 존대. 문장이 짧다." max={300}
                    defaultValue={draft?.personality.speechStyle ?? ''} />
                </LabeledField>
                <BodyPicker build={build} onBuild={setBuild} gender={gender} onGender={setGender}
                  height={draft?.appearance.body.height ?? ''} />
              </div>
            </Accordion>
          </div>
        </StepPanel>

        <StepPanel show={step === 'world'}>
          <Card>
            <div className="stack" style={{ gap: 18 }}>
              <LabeledField label="제목" required hint="목록과 카드에 걸리는 한 줄입니다.">
                <ControlledInput name="title" placeholder="예) 비 내리는 공방" max={20} value={title} onChange={setTitle} />
              </LabeledField>
              <LabeledField label="어떤 세계인가요">
                <CountedTextArea name="worldSetting" max={600} rows={4}
                  defaultValue={draft?.world.worldSetting ?? ''}
                  placeholder="상황, 관계, 세계관 등을 설명해주세요." />
              </LabeledField>
            </div>
          </Card>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Accordion title="자세히">
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="시대">
                  <CountedInput name="era" placeholder="예) 현대" max={40} defaultValue={draft?.world.era ?? ''} />
                </LabeledField>
                <LabeledField label="장소">
                  <CountedInput name="location" placeholder="예) 런던 구시가지" max={60} defaultValue={draft?.world.location ?? ''} />
                </LabeledField>
                <LabeledField label="장르">
                  <CountedInput name="genre" placeholder="예) 현대 드라마 · 미스터리" max={60} defaultValue={draft?.world.genre ?? ''} />
                </LabeledField>
              </div>
            </Accordion>
          </div>
        </StepPanel>

        <StepPanel show={step === 'scene'}>
          <Card>
            <div className="stack" style={{ gap: 18 }}>
              <LabeledField label="첫 장면">
                <CountedTextArea name="startingContext" max={600} rows={4}
                  defaultValue={draft?.startingContext ?? ''}
                  placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
              </LabeledField>
              <LabeledField label="시작 시간">
                <CountedInput name="startingTime" placeholder="예) 저녁" max={20} defaultValue={draft?.startingTime ?? ''} />
              </LabeledField>
            </div>
          </Card>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Accordion title="상황 예시">
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label={`${name || '캐릭터'}의 말`}>
                  <CountedTextArea name="sampleCharacter" max={2000} rows={3}
                    placeholder="*작업대에서 눈을 들지 않는다* 의뢰라면 문 옆에 두고 가십시오." />
                </LabeledField>
                <LabeledField label="내 말">
                  <CountedTextArea name="sampleUser" max={2000} rows={3} placeholder="직접 설명드리고 싶은데요." />
                </LabeledField>
              </div>
            </Accordion>
          </div>
        </StepPanel>

        {/* 하나의 문. 마지막 단계에서만 저장이 된다. */}
        <div style={{ marginTop: 'var(--space-7)' }}>
          {last ? (
            <Button type="submit" variant="primary" size="lg" full disabled={!canSubmit}>
              {canSubmit ? '저장하고 시작하기' : '이름과 제목을 채워주세요'}
            </Button>
          ) : (
            <Button type="button" variant="primary" size="lg" full disabled={!canAdvance}
              onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))}>
              다음
            </Button>
          )}
        </div>
      </form>
    </main>
  )
}

const QUESTION: Record<CreateStep, string> = {
  who: '어떤 사람인가요?',
  world: '어떤 세계에 살고 있나요?',
  scene: '어떻게 만나게 되나요?',
}

/**
 * 칸을 묶는 판. 페이지 바닥보다 한 단 밝은 면 위에 얹는다 —
 * 밑줄만 늘어놓으면 어디까지가 한 덩이인지 읽히지 않는다 (레퍼런스).
 */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5) var(--space-4)',
    }}>
      {children}
    </div>
  )
}

/**
 * 단계 하나. 감추더라도 DOM 에 남긴다 — 값이 살아 있어야 마지막에 한 번에 제출된다.
 * hidden 이면 초점도 받지 않아야 해서 inert 를 함께 건다.
 */
function StepPanel({ show, children }: { show: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      initial={false}
      transition={reduce ? { duration: 0 } : { duration: duration.normal, ease: ease.enter }}
      inert={!show}
      style={show
        ? { display: 'block' }
        : { display: 'none' }}>
      {children}
    </motion.div>
  )
}

/**
 * 값을 바깥이 들고 있는 한 줄 입력 (단계 진행 판정에 쓰인다).
 * 상자 대신 밑줄 — form-parts 의 CountedInput 과 같은 규칙이다.
 */
function ControlledInput({ name, placeholder, max, value, onChange, invalid }: {
  name: string; placeholder: string; max: number; value: string; onChange: (v: string) => void; invalid?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 10px',
      borderBottom: `1.5px solid ${invalid ? 'var(--color-danger)' : focused ? 'var(--color-white)' : 'var(--color-border-strong)'}`,
      transition: 'border-color var(--motion-fast) var(--ease-standard)',
    }}>
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-title-3)' }} />
      {value.length >= max * 0.8 && (
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
          {value.length}/{max}
        </span>
      )}
    </div>
  )
}

/**
 * 성별과 체형.
 *
 * 고르는 칸은 글자로 두고, 고른 결과는 그 아래 전신 아바타 하나로 보여준다 —
 * 작은 그림 네 개를 늘어놓으면 어느 것도 제대로 안 보이지만, 한 몸이 바뀌는 것은 읽힌다.
 * 아바타는 성별과 체형을 같이 반영한다 (어깨·허리·가슴·엉덩이 폭이 함께 움직인다).
 */
function BodyPicker({ build, onBuild, gender, onGender, height }: {
  build: string; onBuild: (b: string) => void
  gender: string; onGender: (g: string) => void
  height: string
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
        성별 · 체형{height ? ` · ${height}` : ''}
      </legend>

      <div className="stack" style={{ gap: 8 }}>
        <ChoiceRow options={GENDER_TYPES.map((g) => ({ value: g, label: GENDER_PRESETS[g].label }))}
          value={gender} onChange={onGender} />
        <ChoiceRow options={BUILD_TYPES.map((b) => ({ value: b, label: BUILD_PRESETS[b].label }))}
          value={build} onChange={onBuild} />
      </div>

      {/* 고른 값이 선 사람. 칸 밑에 세워 두면 바꿀 때마다 바로 보인다. */}
      <div style={{
        display: 'grid', placeItems: 'center', padding: 'var(--space-5) 0 var(--space-4)',
        marginTop: 'var(--space-4)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)',
      }}>
        <Avatar build={build} gender={gender} />
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
          {GENDER_PRESETS[gender as keyof typeof GENDER_PRESETS]?.label} · {BUILD_PRESETS[build as keyof typeof BUILD_PRESETS]?.label}
        </span>
      </div>
    </fieldset>
  )
}

/** 한 줄짜리 선택 — 고른 칸만 라임으로 찬다. */
function ChoiceRow({ options, value, onChange }: {
  options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void
}) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <motion.button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={on}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            style={{
              minHeight: 42, padding: '10px 8px', cursor: 'pointer', borderRadius: 'var(--radius-button)',
              fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
              border: `1.5px solid ${on ? 'var(--color-accent)' : 'transparent'}`,
              color: on ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
            }}>
            {o.label}
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * 전신 아바타. 머리·목·몸통·팔·다리를 가진 한 사람으로 그린다.
 *
 * 체형은 어깨·허리 폭으로, 성별은 어깨 대비 엉덩이 폭과 가슴선으로 구분한다 —
 * 옷이나 머리 모양으로 성별을 표시하지 않는다 (그건 사람마다 다르고, 여기서 정할 일이 아니다).
 * 값이 이어져 보이도록 폭이 바뀔 때 Motion 이 path 를 잇는다.
 */
function Avatar({ build, gender }: { build: string; gender: string }) {
  const reduce = useReducedMotion()
  const female = gender === 'female'

  // 체형별 [어깨 반너비, 허리 반너비, 배 볼록]
  const byBuild: Record<string, [number, number, number]> = {
    slim: [10, 7, 0],
    average: [12, 9, 0],
    muscular: [15.5, 9.5, 0],
    heavy: [13.5, 14.5, 2.5],
  }
  const [shoulder, waist, belly] = byBuild[build] ?? byBuild.average!
  // 여성은 어깨를 조금 좁히고 골반을 넓힌다.
  const sh = female ? shoulder * 0.88 : shoulder
  const hip = female ? waist * 1.3 : waist * 1.05
  const cx = 40

  // 팔은 몸통 옆선 바깥에 붙되 1.5 만큼 띄운다 — 붙이면 몸통에 먹히고, 멀면 떠 보인다.
  const armIn = Math.max(sh, waist + belly) + 1.5
  const t = reduce ? { duration: 0 } : { duration: 0.32, ease: 'easeOut' as const }

  return (
    <svg aria-hidden width="92" height="160" viewBox="0 0 80 140" fill="currentColor"
      style={{ color: 'var(--color-accent)' }}>
      <circle cx={cx} cy="14" r="8.5" />
      {/* 목 — 짧게. 길면 사람이 아니라 인형처럼 보인다. */}
      <rect x={cx - 3} y="21" width="6" height="3.5" />

      {/* 몸통: 어깨 → 허리 → 골반 */}
      <motion.path
        animate={{
          d: [
            `M${cx - sh} 26`,
            `Q${cx - sh} 38 ${cx - waist - belly} 50`,
            `L${cx - hip} 64`,
            `Q${cx} 68 ${cx + hip} 64`,
            `L${cx + waist + belly} 50`,
            `Q${cx + sh} 38 ${cx + sh} 26`,
            `Q${cx} 23 ${cx - sh} 26`,
            'Z',
          ].join(' '),
        }}
        transition={t} />

      {/* 팔 — 어깨 높이에서 시작해 손목까지. 폭은 체형을 따라간다. */}
      <motion.path animate={{ d: `M${cx - armIn - 4.5} 29 L${cx - armIn} 28 L${cx - armIn + 1} 62 L${cx - armIn - 3.5} 62 Z` }} transition={t} />
      <motion.path animate={{ d: `M${cx + armIn + 4.5} 29 L${cx + armIn} 28 L${cx + armIn - 1} 62 L${cx + armIn + 3.5} 62 Z` }} transition={t} />

      {/* 다리 — 골반에서 내려온다. 가운데를 갈라 두 다리로 읽히게. */}
      <motion.path animate={{ d: `M${cx - hip + 0.5} 64 L${cx - 1.6} 64 L${cx - 2.4} 124 L${cx - hip + 2.5} 124 Z` }} transition={t} />
      <motion.path animate={{ d: `M${cx + hip - 0.5} 64 L${cx + 1.6} 64 L${cx + 2.4} 124 L${cx + hip - 2.5} 124 Z` }} transition={t} />
    </svg>
  )
}
