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

/** 라벨 + 입력칸 한 덩이. 글자 수 표시는 값 길이를 받아 직접 그린다. */
export function LabeledField({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
        {required && <Star />}{label}
      </span>
      {children}
      {hint && !error && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{hint}</span>}
      {error && (
        <span role="alert" className="t-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-danger)' }}>
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" strokeLinecap="round" />
          </svg>
          {error}
        </span>
      )}
    </div>
  )
}

/** 글자 수가 붙은 한 줄 입력. 세는 일은 화면이 한다 — 서버는 maxLength 로 다시 자른다. */
export function CountedInput({ name, placeholder, max, defaultValue = '', required, invalid }: {
  name: string; placeholder: string; max: number; defaultValue?: string; required?: boolean; invalid?: boolean
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
      background: 'var(--color-surface-2)', borderRadius: 'var(--radius-button)',
      border: `1px solid ${invalid ? 'var(--color-danger)' : 'transparent'}`,
    }}>
      <input name={name} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max}
        placeholder={placeholder} required={required} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)' }} />
      <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0, color: 'var(--color-text-tertiary)' }}>
        {value.length}/{max}
      </span>
    </div>
  )
}

/** 글자 수가 붙은 여러 줄 입력. 안내문은 placeholder 에 예시까지 넣는다 (레퍼런스). */
export function CountedTextArea({ name, placeholder, max, rows = 4, defaultValue = '' }: {
  name: string; placeholder: string; max: number; rows?: number; defaultValue?: string
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-button)', padding: '12px 14px' }}>
      <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        style={{
          width: '100%', background: 'none', border: 0, outline: 'none', resize: 'vertical',
          color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', lineHeight: 1.6, fontFamily: 'inherit',
        }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
          {value.length}/{max}
        </span>
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
      <motion.button type="button" onClick={() => setOpen(true)}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          width: 128, height: 128, margin: '0 auto', cursor: 'pointer',
          background: preview ? `center/cover no-repeat url(${preview})` : 'transparent',
          border: `1px dashed ${preview ? 'transparent' : 'var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)',
        }}>
        {!preview && (
          <>
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{count}/{maxCount}</span>
            <span className="t-caption" style={{ textAlign: 'center', lineHeight: 1.3 }}>{required && <Star />}{label}</span>
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
            내 것이 아니면 허락받고 쓰세요. 삭제·차단될 수 있어요.
          </p>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
            웹툰·게임 등 남의 그림, 아이돌·친구 등 남의 사진이 여기 해당합니다.
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
          생성·보관은 준비 중입니다. 고른 사진은 미리보기로만 쓰입니다.
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
