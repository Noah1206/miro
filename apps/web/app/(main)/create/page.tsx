'use client'
import { Suspense, useActionState, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Accordion, Button, MenuItem, Notice, Page, Popover } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'
import { createDraft, saveCharacter, type DraftState } from './actions'
import { BUILD_PRESETS, BUILD_TYPES } from '@miro/domain'
import { GENRES } from '@/lib/genres'
import { CreateHeader, type CreateTab } from './header'
import { AddRow, CountedInput, CountedTextArea, FormSection, ImagePicker, LabeledField } from './form-parts'

const EXAMPLES = [
  '다른 사람한텐 싸가지 없는데 나한테만 잘해주는 30살 검사',
  '같은 병원에서 일하는 무뚝뚝한 외과의',
  '내 정체를 알고도 모른 척해주는 조직의 간부',
]

/** 전체 글자 수 상한 — 레퍼런스와 같은 자리에 같은 형식으로 보여준다. */
const TOTAL_MAX = 2400

type Mode = 'choose' | 'form'

export default function CreatePage() {
  // useSearchParams 는 Suspense 경계를 요구한다.
  return <Suspense fallback={null}><CreateEntry /></Suspense>
}

function CreateEntry() {
  // 내비의 시트에서 '직접 만들기' 를 고르면 ?mode=manual 로 들어온다 — 고른 것을 또 고르게 하지 않는다.
  const params = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'manual' ? 'form' : 'choose')
  const [tab, setTab] = useState<CreateTab>('prompt')
  const [state, action, pending] = useActionState(createDraft, { draft: null, error: null, providerNotice: null } satisfies DraftState)

  // AI 초안이 도착하면 폼으로 넘어간다 — 빈칸이 이미 채워진 상태로.
  const draft = state.draft
  if (draft && mode === 'choose') setMode('form')

  if (mode === 'choose') {
    return <Chooser onManual={() => setMode('form')} action={action} pending={pending} state={state} />
  }
  return <CreateForm tab={tab} onTab={setTab} draft={draft} providerNotice={state.providerNotice} />
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
 * 본 폼 (레퍼런스 구조): 기본 설정 → 캐릭터 → 대화 프로필 → 상황 예시.
 * AI 초안이 있으면 같은 칸이 미리 채워져 있다 — 사용자는 고치기만 하면 된다.
 */
function CreateForm({ tab, onTab, draft, providerNotice }: {
  tab: CreateTab
  onTab: (t: CreateTab) => void
  draft: Draft | null
  providerNotice: string | null
}) {
  const [title, setTitle] = useState('')
  const [name, setName] = useState(draft?.identity.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [build, setBuild] = useState<string>(draft?.appearance.body.build ?? 'average')

  // 필수: 제목과 캐릭터 이름. 둘이 차야 등록이 열린다.
  const canSubmit = title.trim().length > 0 && name.trim().length > 0

  // 전체 글자 수는 대략치다 — 어떤 칸이 얼마나 찼는지 감을 주는 자리다.
  const total = useMemo(() => title.length + name.length, [title, name])

  return (
    // Page 는 등장 애니메이션으로 transform 을 건다 — transform 된 조상 안에서는 sticky 가
    // 뷰포트가 아니라 그 조상에 붙어 머리가 화면 중간에 떠 버린다. 그래서 여기서는 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page" style={{ maxWidth: 560, paddingTop: 0, outline: 'none' }}>
      <form action={saveCharacter} className="stack" style={{ gap: 0 }}>
        {draft && <input type="hidden" name="draft" value={JSON.stringify(draft)} />}
        <input type="hidden" name="build" value={build} />

        <CreateHeader tab={tab} onTab={onTab} canSubmit={canSubmit} pending={false} total={total} max={TOTAL_MAX} />

        {providerNotice && <Notice style={{ marginTop: 16 }}>⚠ {providerNotice}</Notice>}

        {tab === 'prompt' && (
          <>
            <FormSection title="기본 설정">
              <div className="stack" style={{ gap: 16 }}>
                <LabeledField label="제목" required>
                  <CountedInputControlled name="title" placeholder="제목을 입력해주세요." max={20} value={title} onChange={setTitle} required />
                </LabeledField>
                <LabeledField label="설명">
                  <CountedTextArea name="worldSetting" max={600} rows={4}
                    defaultValue={draft?.world.worldSetting ?? ''}
                    placeholder="상황, 관계, 세계관 등을 설명해주세요." />
                </LabeledField>
              </div>

              <div style={{ marginTop: 16 }}>
                <Accordion title="고급 설정">
                  <div className="stack" style={{ gap: 16 }}>
                    <LabeledField label="시대">
                      <CountedInput name="era" placeholder="예) 현대" max={40} defaultValue={draft?.world.era ?? ''} />
                    </LabeledField>
                    <LabeledField label="장소">
                      <CountedInput name="location" placeholder="예) 서울 강남" max={60} defaultValue={draft?.world.location ?? ''} />
                    </LabeledField>
                    <LabeledField label="장르" hint={GENRES.map((g) => g.title).join(' · ')}>
                      <CountedInput name="genre" placeholder="예) 현대 드라마 · 미스터리" max={60} defaultValue={draft?.world.genre ?? ''} />
                    </LabeledField>
                    <LabeledField label="내레이터" hint="이야기를 이끌어갈 내레이터를 설정해 주세요. 예) 인물의 속마음이나 욕망을 독백처럼 직접 서술한다.">
                      <CountedTextArea name="narrator" max={300} rows={3} placeholder="이야기를 이끌어갈 내레이터를 설정해 주세요." />
                    </LabeledField>
                  </div>
                </Accordion>
              </div>
            </FormSection>

            <FormSection title="캐릭터">
              <ImagePicker label="캐릭터 이미지" required count={0} maxCount={5} />
              <div className="stack" style={{ gap: 16, marginTop: 16 }}>
                <LabeledField label="이름" required
                  error={nameTouched && !name.trim() ? '캐릭터 이름을 입력해주세요' : null}>
                  <CountedInputControlled name="name" placeholder="짧은 이름이 부르기 편해요. 예) 수현" max={10}
                    value={name} onChange={(v) => { setName(v); setNameTouched(true) }} required
                    invalid={nameTouched && !name.trim()} />
                </LabeledField>
                <LabeledField label="설명">
                  <CountedTextArea name="personality" max={600} rows={4}
                    defaultValue={draft?.personality.personality ?? ''}
                    placeholder={'캐릭터의 특징, 행동, 감정 표현에 대해서 써주시면 개성 있는 캐릭터를 만들 수 있어요.\n예) 수현은 말이 험하고 온갖 비속어를 휘황찬란하게 사용한다.'} />
                </LabeledField>
                <LabeledField label="말투">
                  <CountedInput name="speechStyle" placeholder="예) 존대. 문장이 짧고 군더더기가 없다." max={300}
                    defaultValue={draft?.personality.speechStyle ?? ''} />
                </LabeledField>
                <BuildPicker build={build} onChange={setBuild} height={draft?.appearance.body.height ?? ''} />
              </div>
            </FormSection>

            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginTop: 12 }}>
              ※ 저작권 침해, 선정성 등 비윤리적인 캐릭터는 삭제될 수 있어요.
            </p>

            <AddRow label="캐릭터 추가" count={1} max={10} />
          </>
        )}

        {tab === 'profile' && (
          <>
            <FormSection title="플레이하는 유저가 사용할 대화 프로필을 만들어 주세요" subtitle="글자 수 제한에 포함되지 않아요">
              <ImagePicker label="대화 프로필 이미지" required count={0} maxCount={1} />
              <div className="stack" style={{ gap: 16, marginTop: 16 }}>
                <LabeledField label="이름" required>
                  <CountedInput name="profileName" placeholder="짧은 이름이 부르기 편해요. 예) 지우" max={20} />
                </LabeledField>
                <LabeledField label="짧은 소개" required>
                  <CountedTextArea name="profileTagline" max={50} rows={3}
                    placeholder={'한 눈에 파악할 수 있는 짧은 소개를 입력해주세요. 이 내용은 AI에게 전달되지 않아요.\n예) 수현과 같은 반 반장. 모범생 이미지로 인기가 많지만 의외로 눈치는 없다.'} />
                </LabeledField>
                <LabeledField label="설명">
                  <CountedTextArea name="profileDescription" max={1000} rows={4}
                    placeholder={'캐릭터를 만들 때처럼 구체적인 설명을 써주시면 좋아요.\n예) 18살, 키 181cm, 잘생긴 얼굴과 1등을 놓치지 않는 성적으로 모두에게 인기있는 모범생'} />
                </LabeledField>
              </div>
            </FormSection>

            <AddRow label="대화 프로필 추가" count={1} max={5} />
          </>
        )}

        {tab === 'intro' && (
          <>
            <FormSection title="인트로" subtitle="대화가 시작되는 첫 장면입니다.">
              <div className="stack" style={{ gap: 16 }}>
                <LabeledField label="시작 장면" required>
                  <CountedTextArea name="startingContext" max={600} rows={4}
                    defaultValue={draft?.startingContext ?? ''}
                    placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
                </LabeledField>
                <LabeledField label="시작 시간">
                  <CountedInput name="startingTime" placeholder="예) 저녁" max={20} defaultValue={draft?.startingTime ?? ''} />
                </LabeledField>
              </div>
            </FormSection>

            <FormSection title="상황 예시로 캐릭터의 성격과 말투를 표현해 주세요" subtitle="전체 글자 수 제한에는 포함되지 않아요">
              <div className="stack" style={{ gap: 16 }}>
                <LabeledField label="캐릭터의 말">
                  <CountedTextArea name="sampleCharacter" max={2000} rows={3}
                    placeholder={name ? `${name}의 대사를 적어주세요.` : '캐릭터 이름을 먼저 입력해주세요'} />
                </LabeledField>
                <LabeledField label="유저의 말">
                  <CountedTextArea name="sampleUser" max={2000} rows={3} placeholder="유저가 할 법한 말을 적어주세요." />
                </LabeledField>
              </div>
            </FormSection>
          </>
        )}
      </form>
    </main>
  )
}

/** 값을 바깥이 들고 있는 한 줄 입력 (필수 판정에 쓰인다). */
function CountedInputControlled({ name, placeholder, max, value, onChange, required, invalid }: {
  name: string; placeholder: string; max: number; value: string; onChange: (v: string) => void; required?: boolean; invalid?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
      background: 'var(--color-surface-2)', borderRadius: 'var(--radius-button)',
      border: `1px solid ${invalid ? 'var(--color-danger)' : 'transparent'}`,
    }}>
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max}
        placeholder={placeholder} required={required} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)' }} />
      <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0, color: 'var(--color-text-tertiary)' }}>
        {value.length}/{max}
      </span>
    </div>
  )
}

/** 체형은 사용자가 고른다 — 초안 값이 기본 선택. */
function BuildPicker({ build, onChange, height }: { build: string; onChange: (b: string) => void; height: string }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        체형{height ? ` · ${height}` : ''}
      </legend>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {BUILD_TYPES.map((b) => {
          const on = b === build
          return (
            <button key={b} type="button" onClick={() => onChange(b)} aria-pressed={on}
              style={{
                minHeight: 40, padding: '8px 16px', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                background: on ? 'var(--color-white)' : 'var(--color-surface-2)',
                color: on ? 'var(--color-black)' : 'var(--color-text-secondary)',
                border: 0,
              }}>
              {BUILD_PRESETS[b].label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
