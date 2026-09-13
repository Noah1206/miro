'use client'
import { Suspense, useActionState, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Accordion, Button, MenuItem, Notice, Page, Popover } from '@/components/ui'
import { duration, ease, tween } from '@/lib/motion/tokens'
import { createDraft, saveCharacter, type DraftState } from './actions'
import { BUILD_PRESETS, BUILD_TYPES, GENDER_PRESETS, GENDER_TYPES } from '@miro/domain'
import { CreateHeader } from './header'
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
 * 한 장짜리 만들기 폼.
 *
 * 단계로 나누지 않는다 — 캐릭터를 만드는 일은 앞뒤를 오가며 고치는 일이고,
 * '다음' 으로 막아 두면 뒤 칸을 보려고 앞 칸을 대충 채우게 된다.
 * 대신 섹션 제목으로 나눈다: 캐릭터 → 세계 → 첫 장면. 제목은 카드 바깥에 둔다.
 */
function CreateForm({ draft, providerNotice }: { draft: Draft | null; providerNotice: string | null }) {
  const [name, setName] = useState(draft?.identity.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [title, setTitle] = useState('')
  const [build, setBuild] = useState<string>(draft?.appearance.body.build ?? 'average')
  const [gender, setGender] = useState<string>(draft?.appearance.body.gender ?? 'male')

  const canSubmit = name.trim().length > 0 && title.trim().length > 0

  return (
    // Page 는 등장 애니메이션으로 transform 을 건다 — transform 된 조상 안에서는 sticky 가
    // 뷰포트가 아니라 그 조상에 붙어 머리가 화면 중간에 떠 버린다. 그래서 여기서는 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page"
      style={{ maxWidth: 560, paddingTop: 0, paddingBottom: 'calc(var(--nav-h) + 96px)', outline: 'none' }}>
      <form action={saveCharacter} className="stack" style={{ gap: 0 }}>
        {draft && <input type="hidden" name="draft" value={JSON.stringify(draft)} />}
        <input type="hidden" name="build" value={build} />
        <input type="hidden" name="gender" value={gender} />

        <CreateHeader />

        {providerNotice && <Notice style={{ marginTop: 16 }}>⚠ {providerNotice}</Notice>}

        <Section title="캐릭터">
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
          <Folded title="자세히">
            <LabeledField label="말투">
              <CountedInput name="speechStyle" placeholder="예) 존대. 문장이 짧다." max={300}
                defaultValue={draft?.personality.speechStyle ?? ''} />
            </LabeledField>
            <BodyPicker build={build} onBuild={setBuild} gender={gender} onGender={setGender}
              height={draft?.appearance.body.height ?? ''} />
          </Folded>
        </Section>

        <Section title="세계">
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
          <Folded title="자세히">
            <LabeledField label="시대">
              <CountedInput name="era" placeholder="예) 현대" max={40} defaultValue={draft?.world.era ?? ''} />
            </LabeledField>
            <LabeledField label="장소">
              <CountedInput name="location" placeholder="예) 런던 구시가지" max={60} defaultValue={draft?.world.location ?? ''} />
            </LabeledField>
            <LabeledField label="장르">
              <CountedInput name="genre" placeholder="예) 현대 드라마 · 미스터리" max={60} defaultValue={draft?.world.genre ?? ''} />
            </LabeledField>
          </Folded>
        </Section>

        <Section title="첫 장면">
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
          <Folded title="상황 예시">
            <LabeledField label={`${name || '캐릭터'}의 말`}>
              <CountedTextArea name="sampleCharacter" max={2000} rows={3}
                placeholder="*작업대에서 눈을 들지 않는다* 의뢰라면 문 옆에 두고 가십시오." />
            </LabeledField>
            <LabeledField label="내 말">
              <CountedTextArea name="sampleUser" max={2000} rows={3} placeholder="직접 설명드리고 싶은데요." />
            </LabeledField>
          </Folded>
        </Section>

        {/* 문은 하나. 스크롤 끝까지 가지 않아도 늘 손에 닿는다. */}
        <div className="detail-cta" style={{ zIndex: 25, padding: '14px var(--space-5)', background: 'linear-gradient(to top, rgba(10,10,11,0.96) 60%, rgba(10,10,11,0))' }}>
          <Button type="submit" variant="primary" size="lg" full disabled={!canSubmit}>
            {canSubmit ? '저장하고 시작하기' : '이름과 제목을 채워주세요'}
          </Button>
        </div>
      </form>
    </main>
  )
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
 * 값을 바깥이 들고 있는 한 줄 입력 (필수 판정에 쓰인다).
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

/** 섹션 — 제목은 카드 바깥에 두고, 그 아래에 카드가 온다. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <h2 className="t-title-3" style={{ marginBottom: 12 }}>{title}</h2>
      <div className="stack" style={{ gap: 'var(--space-3)' }}>{children}</div>
    </section>
  )
}

/** 접힌 칸 묶음 — 덜 중요한 것은 펼쳐야 보인다. */
function Folded({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Accordion title={title}>
      <div className="stack" style={{ gap: 18 }}>{children}</div>
    </Accordion>
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
  const reduce = useReducedMotion()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
        성별 · 체형{height ? ` · ${height}` : ''}
      </legend>

      <ChoiceRow options={GENDER_TYPES.map((g) => ({ value: g, label: GENDER_PRESETS[g].label }))}
        value={gender} onChange={onGender} />

      {/*
        체형은 낱말이 아니라 사진에서 고른다 — '표준' 이 무엇인지는 사람마다 다르게 떠올린다.
        네 장은 같은 옷·같은 배경·같은 거리에서 찍혀 체형만 다르다.
      */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
        {BUILD_TYPES.map((b) => {
          const on = b === build
          return (
            <motion.button key={b} type="button" onClick={() => onBuild(b)} aria-pressed={on}
              aria-label={`${GENDER_PRESETS[gender as keyof typeof GENDER_PRESETS]?.label} ${BUILD_PRESETS[b].label}`}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{
                padding: 3, cursor: 'pointer', borderRadius: 'var(--radius-md)', background: 'none',
                border: `1.5px solid ${on ? 'var(--color-accent)' : 'transparent'}`,
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/builds/${gender}-${b}.webp`} alt="" width={120} height={160} loading="lazy" decoding="async"
                style={{
                  width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block',
                  borderRadius: 'var(--radius-sm)', opacity: on ? 1 : 0.5,
                  transition: 'opacity var(--motion-fast) var(--ease-standard)',
                }} />
              <span className="t-micro" style={{
                display: 'block', textAlign: 'center', textTransform: 'none', letterSpacing: 0, marginTop: 5,
                color: on ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
              }}>
                {BUILD_PRESETS[b].label}
              </span>
            </motion.button>
          )
        })}
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

