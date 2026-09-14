'use client'
import { useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Sheet, Rows, Switch } from '@/components/ui'
export { Rows, Switch }
import { duration, ease } from '@/lib/motion/tokens'

/**
 * 만들기 폼의 조각들 (레퍼런스 UI).
 * 공통 규칙: 라벨 왼쪽 위, 필수는 별표, 글자 수는 입력칸 오른쪽 아래 — 눈이 한 줄에서 다음 줄로만 움직인다.
 */

/** 필수 표시용 별표. 색으로만 구분하지 않는다 — aria-hidden 이고 실제 required 는 input 에 있다. */
function Star() {
  return <span aria-hidden style={{ color: 'var(--color-text-tertiary)', marginRight: 2, fontSize: '0.85em', verticalAlign: 'super' }}>*</span>
}

/**
 * 한 칸.
 *
 * 칸은 얇은 테두리의 둥근 상자 (레퍼런스). 라벨은 값 위에 작게 얹는다. 초점이 들어오면 테두리만 희어진다
 * (초점은 흰색이다 — 라임은 상태를 뜻하므로 '선택됨' 과 '초점' 이 같은 색이면 구분이 안 된다).
 * 글자 수는 한도 근처(80%)에서만 나타난다 — 늘 떠 있으면 세라는 뜻이 되어 버린다.
 */
export function LabeledField({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="t-caption" style={{ color: error ? 'var(--color-danger)' : 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' }}>
        {label}{required && <Star />}
      </span>
      {children}
      {/* 힌트는 카드(surface-1) 위에 놓인다 — quaternary 는 3.6:1 이라 tertiary 로 (axe). */}
      {hint && !error && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{hint}</span>}
      {error && (
        <span role="alert" className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-danger)' }}>
          {error}
        </span>
      )}
    </div>
  )
}

/** 입력 상자 (레퍼런스): 얇은 테두리의 둥근 네모. 초점은 흰 테두리, 오류는 빨강. 채움은 카드보다 한 단 진하게. */
export function box(focused: boolean, invalid?: boolean): React.CSSProperties {
  return {
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : focused ? 'var(--color-white)' : 'var(--color-border-strong)'}`,
    transition: 'border-color var(--motion-fast) var(--ease-standard)',
  }
}

/** 한도의 80% 를 넘겨야 보인다 — 그 전에는 셀 이유가 없다. */
function Counter({ length, max }: { length: number; max: number }) {
  if (length < max * 0.8) return null
  return (
    <span className="t-micro" style={{
      textTransform: 'none', letterSpacing: 0, flexShrink: 0,
      color: length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
    }}>
      {length}/{max}
    </span>
  )
}

/** 한 줄 입력. */
export function CountedInput({ name, placeholder, max, defaultValue = '', required, invalid }: {
  name: string; placeholder: string; max: number; defaultValue?: string; required?: boolean; invalid?: boolean
}) {
  const [value, setValue] = useState(defaultValue)
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', ...box(focused, invalid) }}>
      <input name={name} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} required={required} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
      <Counter length={value.length} max={max} />
    </div>
  )
}

/** 여러 줄 입력. 같은 상자 규칙. */
export function CountedTextArea({ name, placeholder, max, rows = 3, defaultValue = '' }: {
  name: string; placeholder: string; max: number; rows?: number; defaultValue?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: '6px 10px 3px', ...box(focused) }}>
      <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none',
          color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit',
        }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 14 }}>
        <Counter length={value.length} max={max} />
      </div>
    </div>
  )
}

/**
 * 이미지 자리. 점선 사각형을 누르면 바텀시트가 열린다 (레퍼런스).
 * 저장소가 아직 없으므로 고른 파일은 이 화면에서 미리보기로만 쓰인다 — 시트에서 그렇게 밝힌다.
 */
export function ImagePicker({ label, count = 0, maxCount = 5, required }: {
  label: string; count?: number; maxCount?: number; required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputId = useId()
  const reduce = useReducedMotion()

  return (
    <>
      {/* 사진은 가운데 정사각형 한 칸. 눌러서 시트를 연다. */}
      <motion.button type="button" onClick={() => setOpen(true)}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: 132, height: 132, margin: '0 auto', cursor: 'pointer',
          background: preview ? `center/cover no-repeat url(${preview})` : 'var(--color-surface-2)',
          border: `1.5px ${preview ? 'solid transparent' : 'dashed var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-lg)', color: 'var(--color-text-tertiary)',
        }}>
        {!preview && (
          <>
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" />
            </svg>
            <span className="t-caption" style={{ color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.3 }}>
              {label}{required && <Star />}
            </span>
            {/* quaternary 는 surface-2 위에서 3.3:1 이라 못 쓴다 (axe). */}
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
              최대 {maxCount}장
            </span>
          </>
        )}
      </motion.button>

      <Sheet open={open} onClose={() => setOpen(false)} title={`${label}${maxCount > 1 ? ` ${count}/${maxCount}` : ''}`}>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
          한 장당 5MB 이하 (jpg, jpeg, png, webp, heic, heif)
        </p>

        <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 10 }}>
          <label htmlFor={inputId} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <span className="t-body" style={{ color: 'var(--color-text-primary)' }}>기기에서 가져오기</span>
          </label>
          <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPreview(URL.createObjectURL(f))
              setOpen(false)
            }} />
          <p className="t-caption" style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            내 그림이나 사진이 아니라면 꼭 허락받고 쓰세요! 아니면 경고 없이 삭제나 차단될 수 있어요.
          </p>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
            창작자의 허락 없는 그림 : 웹툰, 게임, 핀터레스트 등<br />
            사진 속 사람의 허락 없는 사진 : 아이돌, 친구 등<br />
            특히 스냅샷에 금지된 이미지를 넣으면 법적으로 더 위험할 수 있어요.
          </p>
        </div>

        <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' }}>
          <SheetRow disabled icon={
            <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></>
          }>이미지 생성하기</SheetRow>
          <div style={{ height: 1, background: 'var(--color-border)' }} />
          <SheetRow disabled icon={
            <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 14h5l1.5 2h5L16 14h5" /></>
          }>생성 기록에서 가져오기</SheetRow>
        </div>
        <p className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
          이미지 생성과 보관은 아직 준비 중이에요. 지금 고른 사진은 이 화면에서 미리보기로만 쓰입니다.
        </p>
      </Sheet>
    </>
  )
}

function SheetRow({ children, icon, disabled }: { children: ReactNode; icon: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 16,
        background: 'transparent', border: 0, textAlign: 'left',
        color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      <span className="t-body">{children}</span>
    </button>
  )
}

/** 섹션 한 덩이 — 제목 + 카드. 스크롤하며 차례로 떠오른다. */
export function FormSection({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: ReactNode; action?: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }} transition={{ duration: duration.normal, ease: ease.enter }}
      style={{ marginTop: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 className="t-title-3">{title}</h2>
        {action}
      </div>
      {subtitle && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 10 }}>{subtitle}</p>}
      <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
        {children}
      </div>
    </motion.section>
  )
}

/** 항목을 늘리는 줄 — '+ 캐릭터 추가 1/10'. 한도에 닿으면 눌리지 않는다. */
export function AddRow({ label, count, max, onClick }: { label: string; count: number; max: number; onClick?: () => void }) {
  const full = count >= max
  return (
    <button type="button" onClick={onClick} disabled={full || !onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
        minHeight: 52, marginTop: 'var(--space-4)', padding: '14px 16px', borderRadius: 'var(--radius-button)',
        background: 'var(--color-surface-1)', border: 0,
        color: full || !onClick ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
        cursor: full || !onClick ? 'default' : 'pointer', fontSize: 'var(--font-body-size)',
      }}>
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label} {count}/{max}
    </button>
  )
}

/** 0–100 슬라이더. 양끝 말이 수치보다 먼저 읽히게 한다. */
export function Slider({ name, label, defaultValue, lo, hi }: {
  name: string; label: string; defaultValue: number; lo: string; hi: string
}) {
  const [v, setV] = useState(defaultValue)
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{v}</span>
      </span>
      <input name={name} type="range" min={0} max={100} value={v} onChange={(e) => setV(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-white)' }} />
      <span className="t-micro" style={{ display: 'flex', justifyContent: 'space-between', textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
        <span>{lo}</span><span>{hi}</span>
      </span>
    </label>
  )
}

/**
 * 태그 입력 — 해시태그·취미·싫어하는 것. 칩으로 쌓이고, 값은 쉼표로 이어 hidden 에 싣는다.
 * Enter 나 쉼표로 추가. 한도에 닿으면 입력이 닫힌다.
 */
export function TagInput({ name, placeholder, max, maxLength = 20, defaultValue = [] }: {
  name: string; placeholder: string; max: number; maxLength?: number; defaultValue?: string[]
}) {
  const [tags, setTags] = useState<string[]>(defaultValue)
  const [draft, setDraft] = useState('')
  const full = tags.length >= max
  function commit() {
    const t = draft.trim().replace(/^#/, '').slice(0, maxLength)
    if (!t || tags.includes(t) || full) { setDraft(''); return }
    setTags([...tags, t]); setDraft('')
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input type="hidden" name={name} value={tags.join(',')} />
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`${t} 지우기`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: 0,
                background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', fontSize: 'var(--font-caption)', cursor: 'pointer',
              }}>
              #{t}
              <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          ))}
        </div>
      )}
      {!full && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', ...box(false) }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} maxLength={maxLength} autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() } }}
            style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)' }} />
          <button type="button" onClick={commit} className="t-caption"
            style={{ background: 'none', border: 0, padding: '2px 4px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            + 추가 {tags.length}/{max}
          </button>
        </div>
      )}
      {full && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{tags.length}/{max}</span>}
    </div>
  )
}

/** 여러 개 중 하나. 고른 칩만 라임. 줄바꿈해서 늘어놓는다 (관계 단계처럼 많을 때). */
export function ChoiceChips({ name, options, value, onChange, columns }: {
  name?: string; options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void; columns?: number
}) {
  const reduce = useReducedMotion()
  return (
    <div style={columns
      ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6 }
      : { display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => {
        const on = o.value === value
        return (
          <motion.button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={on}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            style={{
              minHeight: 36, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-button)',
              fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
              border: `1px solid ${on ? 'var(--color-accent)' : 'transparent'}`,
              color: on ? 'var(--color-white)' : 'var(--color-text-secondary)',
            }}>
            {o.label}
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * 상황 예시 편집기 — 캐릭터 말 / 내 말을 번갈아 쌓는다 (제타의 '상황 예시').
 * 값은 JSON 으로 hidden 에 싣는다. 채팅과 같은 규칙: *별표* 안은 서술.
 */
export function DialogueEditor({ name, characterName, defaultValue = [] }: {
  name: string; characterName: string; defaultValue?: Array<{ role: 'character' | 'user'; text: string }>
}) {
  const [turns, setTurns] = useState(defaultValue)
  const update = (i: number, text: string) => setTurns(turns.map((t, j) => (j === i ? { ...t, text } : t)))
  const remove = (i: number) => setTurns(turns.filter((_, j) => j !== i))
  const add = (role: 'character' | 'user') => { if (turns.length < 12) setTurns([...turns, { role, text: '' }]) }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <input type="hidden" name={name} value={JSON.stringify(turns.filter((t) => t.text.trim()))} />
      {turns.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
          <div style={{
            flex: '0 1 88%', background: t.role === 'user' ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
            borderRadius: 'var(--radius-md)', padding: '8px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
                {t.role === 'user' ? '나' : characterName || '캐릭터'}
              </span>
              <button type="button" onClick={() => remove(i)} aria-label="이 말 지우기"
                style={{ background: 'none', border: 0, padding: 2, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <textarea value={t.text} onChange={(e) => update(i, e.target.value)} rows={2} maxLength={500}
              placeholder={t.role === 'user' ? '직접 설명드리고 싶은데요.' : '*눈을 들지 않는다* 문 옆에 두고 가십시오.'}
              style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', lineHeight: 1.5, fontFamily: 'inherit' }} />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => add('character')} disabled={turns.length >= 12} style={addBtn}>+ {characterName || '캐릭터'}의 말</button>
        <button type="button" onClick={() => add('user')} disabled={turns.length >= 12} style={addBtn}>+ 내 말</button>
        <span className="t-micro" style={{ marginLeft: 'auto', alignSelf: 'center', textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{turns.length}/12</span>
      </div>
    </div>
  )
}
const addBtn: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 'var(--radius-button)', border: 0, cursor: 'pointer',
  background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--font-caption)',
}

export type Step = { value: number; label: string; hint: string }

/**
 * 단계 선택 (레퍼런스 '난이도 · 전개 속도' 꼴). 슬라이더 대신 3–4단계 버튼 — 숫자는 감이 안 오고
 * '보통/예민함' 은 바로 읽힌다. 저장 값은 여전히 0–100 이다 (엔진·스키마 불변).
 * 고른 단계의 한 줄 설명이 밑에 붙는다. 기본값은 가장 가까운 단계로 맞춘다.
 */
export function Stepped({ name, label, options, defaultValue }: {
  name: string; label: string; options: readonly Step[]; defaultValue: number
}) {
  const nearest = options.reduce((a, b) => (Math.abs(b.value - defaultValue) < Math.abs(a.value - defaultValue) ? b : a))
  const [value, setValue] = useState(nearest.value)
  const current = options.find((o) => o.value === value) ?? nearest
  const reduce = useReducedMotion()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-body" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)', marginBottom: 10 }}>{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
        {options.map((o) => {
          const on = o.value === value
          return (
            <motion.button key={o.value} type="button" onClick={() => setValue(o.value)} aria-pressed={on}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{
                minHeight: 40, padding: '8px 6px', cursor: 'pointer', borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                border: `1px solid ${on ? 'var(--color-accent)' : 'transparent'}`,
                color: on ? 'var(--color-white)' : 'var(--color-text-secondary)',
              }}>
              {o.label}
            </motion.button>
          )
        })}
      </div>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>{current.hint}</p>
    </fieldset>
  )
}

