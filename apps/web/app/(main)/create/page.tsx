'use client'
import { Suspense, useActionState, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Accordion, Button, MenuItem, Notice, Page, Popover } from '@/components/ui'
import { duration, ease, tween } from '@/lib/motion/tokens'
import { createDraft, saveCharacter, type DraftState } from './actions'
import { BUILD_PRESETS, BUILD_TYPES } from '@miro/domain'
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

        <CreateHeader step={step} index={index} onBack={() => setIndex((i) => Math.max(0, i - 1))} />

        {providerNotice && <Notice style={{ marginTop: 16 }}>⚠ {providerNotice}</Notice>}

        {/* 질문이 먼저 온다 — 칸보다 크게. */}
        <motion.h1 key={step} className="t-title-1"
          initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: ease.enter }}
          style={{ margin: 'var(--space-6) 0 var(--space-5)' }}>
          {QUESTION[step]}
        </motion.h1>

        {/* 단계는 보이기만 바뀐다. DOM 에서 빼면 앞 단계에 쓴 값이 사라진다. */}
        <StepPanel show={step === 'who'}>
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
            <Accordion title="자세히">
              <div className="stack" style={{ gap: 18 }}>
                <LabeledField label="말투">
                  <CountedInput name="speechStyle" placeholder="예) 존대. 문장이 짧다." max={300}
                    defaultValue={draft?.personality.speechStyle ?? ''} />
                </LabeledField>
                <BuildPicker build={build} onChange={setBuild} height={draft?.appearance.body.height ?? ''} />
              </div>
            </Accordion>
          </div>
        </StepPanel>

        <StepPanel show={step === 'world'}>
          <div className="stack" style={{ gap: 18 }}>
            <LabeledField label="제목" required hint="목록과 카드에 걸리는 한 줄입니다.">
              <ControlledInput name="title" placeholder="예) 비 내리는 공방" max={20} value={title} onChange={setTitle} />
            </LabeledField>
            <LabeledField label="어떤 세계인가요">
              <CountedTextArea name="worldSetting" max={600} rows={4}
                defaultValue={draft?.world.worldSetting ?? ''}
                placeholder="상황, 관계, 세계관 등을 설명해주세요." />
            </LabeledField>
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
          <div className="stack" style={{ gap: 18 }}>
            <LabeledField label="첫 장면">
              <CountedTextArea name="startingContext" max={600} rows={4}
                defaultValue={draft?.startingContext ?? ''}
                placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
            </LabeledField>
            <LabeledField label="시작 시간">
              <CountedInput name="startingTime" placeholder="예) 저녁" max={20} defaultValue={draft?.startingTime ?? ''} />
            </LabeledField>
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
 * 체형은 사용자가 고른다 — 글자 대신 실루엣으로 본다.
 *
 * '근육질' 이라는 낱말보다 어깨가 넓은 그림이 빠르다. 네 실루엣은 어깨너비·허리·목 굵기만
 * 다르게 그린 같은 사람이다 — 체형 차이만 읽히고 다른 인상이 섞이지 않아야 한다.
 * 고른 것은 라임 테두리와 옅은 채움으로 표시하고, 이름은 그림 밑에 남겨 둔다 (그림만으로는 모호하다).
 */
function BuildPicker({ build, onChange, height }: { build: string; onChange: (b: string) => void; height: string }) {
  const reduce = useReducedMotion()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
        체형{height ? ` · ${height}` : ''}
      </legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {BUILD_TYPES.map((b) => {
          const on = b === build
          return (
            <motion.button key={b} type="button" onClick={() => onChange(b)} aria-pressed={on}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '12px 4px 10px', cursor: 'pointer', borderRadius: 'var(--radius-md)',
                background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-1)',
                border: `1.5px solid ${on ? 'var(--color-accent)' : 'transparent'}`,
                color: on ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
              }}>
              <Silhouette build={b} />
              <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{BUILD_PRESETS[b].label}</span>
            </motion.button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * 체형 실루엣. 머리 + 몸통 하나로 그린다 — 어깨너비와 허리선만 체형마다 바뀐다.
 * currentColor 를 쓰므로 선택 상태의 색을 그대로 따라간다.
 */
function Silhouette({ build }: { build: string }) {
  // [어깨 반너비, 허리 반너비, 목 굵기, 허리 볼록(+면 배가 나온다)]
  const shape: Record<string, [number, number, number, number]> = {
    slim: [6.5, 5, 2.1, 0],
    average: [8.5, 7, 2.8, 0],
    // 어깨가 넓고 허리로 좁아진다 — V 자가 근육질을 읽게 하는 유일한 단서다.
    muscular: [12, 6.5, 3.8, 0],
    // 어깨는 보통인데 허리가 어깨보다 넓고 옆으로 불룩하다.
    heavy: [9, 11, 3.2, 2.5],
  }
  const [sh, wa, neck, belly] = shape[build] ?? shape.average!
  const cx = 16
  return (
    <svg aria-hidden width="34" height="40" viewBox="0 0 32 40" fill="currentColor">
      <circle cx={cx} cy="8" r="5.4" />
      <path d={[
        `M${cx - neck} 13`,
        `L${cx - sh} 17.5`,
        // 옆선: 볼록값이 있으면 바깥으로 부푼다.
        `Q${cx - wa - belly} 26 ${cx - wa} 33`,
        `Q${cx} 35.5 ${cx + wa} 33`,
        `Q${cx + wa + belly} 26 ${cx + sh} 17.5`,
        `L${cx + neck} 13`,
        'Z',
      ].join(' ')} />
    </svg>
  )
}
