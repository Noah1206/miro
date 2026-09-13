'use client'
import { useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Sheet } from '@/components/ui'
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
 * 회색 상자를 두르지 않는다 — 상자를 쌓으면 화면이 서류가 되고, 어느 칸이 중요한지 사라진다.
 * 대신 밑줄 하나로 칸을 표시하고, 라벨은 값 위에 작게 얹는다. 초점이 들어오면 밑줄만 희어진다
 * (초점은 흰색이다 — 라임은 상태를 뜻하므로 '선택됨' 과 '초점' 이 같은 색이면 구분이 안 된다).
 * 글자 수는 한도 근처(80%)에서만 나타난다 — 늘 떠 있으면 세라는 뜻이 되어 버린다.
 */
export function LabeledField({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: error ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
        {label}{required && <Star />}
      </span>
      {children}
      {hint && !error && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-quaternary)' }}>{hint}</span>}
      {error && (
        <span role="alert" className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-danger)' }}>
          {error}
        </span>
      )}
    </div>
  )
}

/** 밑줄이 초점을 따라 희어진다. 상자가 없으므로 이 선이 유일한 경계다. */
function underline(focused: boolean, invalid?: boolean): React.CSSProperties {
  return {
    borderBottom: `1.5px solid ${invalid ? 'var(--color-danger)' : focused ? 'var(--color-white)' : 'var(--color-border-strong)'}`,
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

/** 한 줄 입력. 밑줄만 있고 상자는 없다. */
export function CountedInput({ name, placeholder, max, defaultValue = '', required, invalid }: {
  name: string; placeholder: string; max: number; defaultValue?: string; required?: boolean; invalid?: boolean
}) {
  const [value, setValue] = useState(defaultValue)
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 10px', ...underline(focused, invalid) }}>
      <input name={name} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} required={required} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)' }} />
      <Counter length={value.length} max={max} />
    </div>
  )
}

/** 여러 줄 입력. 같은 밑줄 규칙 — 칸이 길어져도 상자가 되지 않는다. */
export function CountedTextArea({ name, placeholder, max, rows = 4, defaultValue = '' }: {
  name: string; placeholder: string; max: number; rows?: number; defaultValue?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: '6px 0 8px', ...underline(focused) }}>
      <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none',
          color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)', lineHeight: 1.6, fontFamily: 'inherit',
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
          background: preview ? `center/cover no-repeat url(${preview})` : 'var(--color-surface-1)',
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
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-quaternary)' }}>
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
