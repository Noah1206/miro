'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Sheet, Rows, Switch } from '@/components/ui'
export { Rows, Switch }
import { duration, ease } from '@/lib/motion/tokens'
import { Line } from '../character/[slug]/sections'

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
 * (초점은 흰색이다 — 주황은 상태를 뜻하므로 '선택됨' 과 '초점' 이 같은 색이면 구분이 안 된다).
 * 글자 수는 한도 근처(80%)에서만 나타난다 — 늘 떠 있으면 세라는 뜻이 되어 버린다.
 */
export function LabeledField({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="t-body" style={{ color: error ? 'var(--color-danger)' : 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', marginBottom: 4 }}>
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

/** 입력 상자 (레퍼런스): 얇은 테두리의 둥근 네모. 초점은 한 단 밝은 회색, 오류는 빨강. 채움은 카드보다 한 단 진하게. */
export function box(focused: boolean, invalid?: boolean): React.CSSProperties {
  return {
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
    border: `0.5px solid ${invalid ? 'var(--color-danger)' : focused ? 'var(--color-border-hover)' : 'var(--color-border-strong)'}`,
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
 * 캐릭터 이미지 — 첫 장은 큰 칸(대표), 그 아래 작은 줄에 나머지와 '+' 칸. 최대 maxCount 장.
 * 선택 중에는 로컬 미리보기를 사용하고, 제출 시 서버가 Storage에 업로드한다.
 */
type Picked = { url: string; file: File }

export function ImagePicker({ label, maxCount = 5, required, existing = [] }: {
  label: string; maxCount?: number; required?: boolean
  /** 편집 화면에서 이미 저장된 사진 URL — 새로 고르지 않으면 그대로 유지된다. */
  existing?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [previews, setPreviews] = useState<Picked[]>([])
  const [kept, setKept] = useState<string[]>(existing)
  const [imageOrder, setImageOrder] = useState<string[]>(existing)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const reduce = useReducedMotion()
  // 기존 사진(이미 저장됨)이 새 사진 앞에 온다. 대표는 언제나 0번째.
  const items: Array<{ url: string; kind: 'existing' | 'new' }> = [
    ...kept.map((url) => ({ url, kind: 'existing' as const })),
    ...previews.map((p) => ({ url: p.url, kind: 'new' as const })),
  ].sort((a, b) => imageOrder.indexOf(a.url) - imageOrder.indexOf(b.url))
  const main = items[0]?.url ?? null
  const full = items.length >= maxCount

  // 폼 제출용 실제 파일 input — 순서가 바뀔 때마다 DataTransfer 로 다시 채운다.
  useEffect(() => {
    const input = fileInputRef.current
    if (!input) return
    const dt = new DataTransfer()
    for (const item of items) {
      const picked = previews.find(p => p.url === item.url)
      if (picked) dt.items.add(picked.file)
    }
    input.files = dt.files
  }, [previews, imageOrder])

  const removeAt = (i: number) => {
    const item = items[i]
    if (!item) return
    setImageOrder(xs => xs.filter(url => url !== item.url))
    if (item.kind === 'existing') setKept(xs => xs.filter(url => url !== item.url))
    else {
      URL.revokeObjectURL(item.url)
      setPreviews(xs => xs.filter(p => p.url !== item.url))
    }
  }

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const ordered = items.map(item => item.url)
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved!)
    setImageOrder(ordered)
  }
  const dragHandlers = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overIndex !== i) setOverIndex(i) },
    onDragLeave: () => setOverIndex((v) => (v === i ? null : v)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null); setOverIndex(null) },
    onDragEnd: () => { setDragIndex(null); setOverIndex(null) },
  })

  return (
    <>
      {/* 실제 파일 — 서버 액션(saveCharacter)이 업로드한다. 순서가 바뀔 때마다 useEffect 가 다시 채운다. */}
      <input ref={fileInputRef} type="file" name="images" multiple hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
      {/* 이미 저장된 사진 — 새로 고르지 않으면 이 URL 목록 그대로 유지된다 (편집 화면). */}
      {items.filter(it => it.kind === 'existing').map(({ url }) => <input key={url} type="hidden" name="keptImages" value={url} />)}
      {/* 최종 순서 — 'existing'(기존 URL 그대로) 또는 'new'(방금 고른 파일, images 의 순서대로) 토큰을 대표부터 나열한다.
          기존·새 사진을 드래그로 섞어도 서버가 같은 순서로 합칠 수 있게 한다. */}
      {items.map((it) => <input key={it.url} type="hidden" name="imageOrder" value={it.kind} />)}
      {/* 대표 사진 — 가운데 정사각형 한 칸. 눌러서 시트를 연다. 고른 사진은 살짝 커진 채로 나타나 제자리에 앉는다.
          다른 사진을 이 위로 드래그해 놓으면 그 사진이 대표가 된다. 드래그(div)와 클릭(button)을 분리한다 — framer motion 의 pan 이벤트가 네이티브 onDragStart 와 충돌한다. */}
      <div {...(main ? dragHandlers(0) : {})} style={{ width: 200, margin: '0 auto', cursor: main ? 'grab' : undefined }}>
        <motion.button type="button" onClick={() => setOpen(true)} aria-label={main ? `${label} 대표 사진 바꾸기 (드래그로 순서 변경 가능)` : label}
          whileTap={reduce ? undefined : { scale: 0.98 }}
          style={{
            position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: 200, aspectRatio: '1 / 1', cursor: main ? 'grab' : 'pointer', background: 'var(--color-surface-2)',
            borderWidth: 1.5,
            borderColor: overIndex === 0 && dragIndex !== null && dragIndex !== 0 ? 'var(--color-border-hover)' : main ? 'transparent' : 'var(--color-border-strong)',
            borderStyle: main ? 'solid' : 'dashed',
            opacity: dragIndex === 0 ? 0.5 : 1,
            transition: 'border-color var(--motion-fast) var(--ease-standard)',
            borderRadius: 'var(--radius-lg)', color: 'var(--color-text-tertiary)',
          }}>
          <AnimatePresence initial={false}>
            {main && (
              // eslint-disable-next-line @next/next/no-img-element
              <motion.img key={main} src={main} alt="" draggable={false}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: duration.fast } }}
                transition={{ duration: duration.normal, ease: ease.enter }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {!main && (
              <motion.span key="empty" exit={{ opacity: 0, transition: { duration: duration.fast } }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" />
                </svg>
                <span className="t-caption" style={{ color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.3 }}>
                  {label}{required && <Star />}
                </span>
                {/* quaternary 는 surface-2 위에서 3.3:1 이라 못 쓴다 (axe). */}
                <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
                  최대 {maxCount}장
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* 나머지 사진 줄 — 대표를 넣은 뒤에만. 썸네일은 누르면 빠지고, '+' 로 더 넣는다. 드래그로 순서를 바꿀 수 있다. */}
      {main && (
        <ul aria-label="추가 사진" style={{ listStyle: 'none', margin: '12px auto 0', padding: 0, width: 200, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <AnimatePresence initial={false}>
            {items.slice(1).map((it, i) => (
              // 드래그(li, 네이티브)와 애니메이션(motion.div)을 분리한다 — 대표 사진 칸과 같은 이유.
              <li key={it.url} {...dragHandlers(i + 1)} style={{ opacity: dragIndex === i + 1 ? 0.5 : 1, cursor: 'grab' }}>
                <motion.div initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: duration.fast }}>
                  <button type="button" onClick={() => removeAt(i + 1)} aria-label={`${i + 2}번째 사진 빼기 (드래그로 순서 변경 가능)`}
                    style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', padding: 0, borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', background: 'var(--color-surface-2)',
                      border: `1.5px solid ${overIndex === i + 1 && dragIndex !== null && dragIndex !== i + 1 ? 'var(--color-border-hover)' : 'transparent'}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <span aria-hidden style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(var(--color-bg-rgb),0.75)', color: 'var(--color-white)' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </span>
                  </button>
                </motion.div>
              </li>
            ))}
          </AnimatePresence>
          {!full && (
            <li>
              <button type="button" onClick={() => setOpen(true)} aria-label={`사진 추가 (${items.length}/${maxCount})`}
                style={{ width: '100%', aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'var(--color-surface-2)',
                  border: '1.5px dashed var(--color-border-strong)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </li>
          )}
        </ul>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={`${label} ${items.length}/${maxCount}`}>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
          한 장당 5MB 이하 (jpg, jpeg, png, webp, heic, heif)
        </p>

        <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 10 }}>
          <label htmlFor={inputId} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <span className="t-body" style={{ color: 'var(--color-text-primary)' }}>기기에서 가져오기</span>
          </label>
          <input id={inputId} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, maxCount - items.length))
              if (files.length > 0) {
                const added = files.map(file => ({ url: URL.createObjectURL(file), file }))
                setPreviews(xs => [...xs, ...added])
                setImageOrder(xs => [...xs, ...added.map(p => p.url)])
              }
              e.target.value = ''
              setOpen(false)
            }} />
        </div>
        <p className="t-caption" style={{ color: 'var(--color-danger)', marginTop: 18, padding: '0 4px' }}>
          내 그림이나 사진이 아니라면 꼭 허락받고 쓰세요!<br />
          아니면 경고 없이 삭제나 차단될 수 있어요.
        </p>
      </Sheet>
    </>
  )
}

/**
 * 태그 입력 — 분위기·스타일 같은 복수 선택값. 칩으로 쌓이고, 값은 쉼표로 이어 hidden 에 싣는다.
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
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`${t} 지우기`} className="hit"
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
          <button type="button" onClick={commit} className="t-caption hit"
            style={{ background: 'none', border: 0, padding: '2px 4px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            + 추가 {tags.length}/{max}
          </button>
        </div>
      )}
      {full && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{tags.length}/{max}</span>}
    </div>
  )
}

/** 여러 개 중 하나. 고른 칩만 주황. 줄바꿈해서 늘어놓는다 (관계 단계처럼 많을 때). */
export function ChoiceChips({ name, options, value, onChange, columns, pill = false }: {
  name?: string; options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void; columns?: number; pill?: boolean
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
              minHeight: pill ? 32 : 44, padding: pill ? '4px 12px' : '6px 12px', cursor: 'pointer', borderRadius: pill ? 999 : 'var(--radius-button)',
              fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              background: on ? 'var(--color-accent)' : 'var(--color-surface-2)',
              border: 0,
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
 * 상황 예시 — 채팅처럼 쌓는다. 아래에서 화자(내레이터·유저·캐릭터)를 고르고 한 마디씩 올린다.
 * 올린 말은 말풍선으로 보이고, 연필로 고치고 휴지통으로 지운다. 상세 페이지가 같은 모양으로 보여준다.
 */
export function DialogueEditor({ name, characterName, defaultValue = [], fill = false, header, onCharacterCountChange, intro = false }: {
  name: string; characterName: string; defaultValue?: Turn[]
  /** 전체 화면: 목록이 남는 높이를 채우며 스크롤되고, 입력은 바닥에 붙는다. */
  fill?: boolean
  /** 목록 위에 얹을 것 (첫 장면). */
  header?: React.ReactNode
  intro?: boolean
  onCharacterCountChange?: (count: number) => void
}) {
  const [turns, setTurns] = useState<Turn[]>(defaultValue)
  useEffect(() => { onCharacterCountChange?.(turns.reduce((sum, turn) => sum + turn.text.length, 0)) }, [turns, onCharacterCountChange])
  const [role, setRole] = useState<Turn['role']>('character')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const who = characterName || '캐릭터'
  // 고른 글자를 *별표* 로 감싼다 — 채팅과 같은 규칙: 별표 안은 옅은 서술이 된다. 고른 게 없으면 별표 한 쌍을 넣고 그 사이에 커서를 둔다.
  // 포커스는 옮기지 않는다 — 버튼이 mousedown 에서 포커스를 뺏지 않으므로 커서는 입력창에 그대로 있다.
  // 프로그램으로 focus() 를 부르면 macOS 크로미움에서 한글 입력기가 붙지 않아 영문만 찍히는 일이 있었다.
  const wrapNarration = () => {
    const el = draftRef.current
    if (!el) return
    if (document.activeElement !== el) el.focus()
    commit(el)
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length
    // 값을 직접 갈아끼우지 않고 브라우저 편집 명령으로 넣는다 — input 이벤트로 상태에 반영된다.
    const ok = document.execCommand('insertText', false, `*${el.value.slice(a, b)}*`)
    if (!ok) setDraft(`${el.value.slice(0, a)}*${el.value.slice(a, b)}*${el.value.slice(b)}`)
    // 고른 글자가 없었으면 커서를 별표 사이에 둔다. 넣은 직후의 실제 커서에서 계산해야 조합 확정으로 밀린 만큼이 반영된다.
    const end = el.selectionEnd ?? el.value.length
    const caret = a === b ? end - 1 : end
    requestAnimationFrame(() => el.setSelectionRange(caret, caret))
  }
  // 한글 조합 중인 마지막 글자를 확정한다 — 값을 바꾸기 전에 안 하면 IME 가 그 글자를 새 값 위에 다시 얹는다.
  const commit = (el: HTMLTextAreaElement) => { if (document.activeElement === el) { el.blur(); el.focus() } }
  // 입력창 옆 버튼들은 눌러도 포커스를 가져가지 않는다 — 한글 조합과 커서가 입력창에 남는다.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()
  const label = (r: Turn['role']) => (r === 'narrator' ? '내레이터' : r === 'user' ? '유저' : who)
  const totalCharacters = turns.reduce((sum, turn) => sum + turn.text.length, 0)
  const remaining = intro ? Math.max(0, 2000 - totalCharacters) : 500
  const full = turns.length >= MAX_TURNS || remaining === 0

  const add = () => {
    const el = draftRef.current
    if (el) commit(el)
    const text = (el?.value ?? draft).trim()
    if (!text || full || (intro && text.length > remaining)) return
    setTurns([...turns, { role, text: text.slice(0, 500) }]); setDraft('')
  }
  const remove = (i: number) => { setTurns(turns.filter((_, j) => j !== i)); if (editing === i) setEditing(null) }
  const startEdit = (i: number) => { setEditing(i); setEditText(turns[i]!.text) }
  const commitEdit = () => {
    if (editing === null) return
    const text = editText.trim()
    if (intro && totalCharacters - turns[editing]!.text.length + text.length > 2000) return
    setTurns(text ? turns.map((t, j) => (j === editing ? { ...t, text } : t)) : turns.filter((_, j) => j !== editing))
    setEditing(null)
  }
  // 한글 조합 중 Enter 는 글자 확정이지 전송이 아니다.
  const onEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>, fn: () => void) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); fn() }
  }

  return (
    <div className="stack" style={{ gap: 12, ...(fill ? { height: '100%' } : {}) }}>
      <input type="hidden" name={name} value={JSON.stringify(turns)} />
      <div style={fill ? { flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8 } : undefined}>
      {header}

      {turns.length === 0 && (
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '14px 0' }}>
          아래에서 누가 말할지 고르고 첫 마디를 적어 보세요.
        </p>
      )}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 12 }}>
        {turns.map((t, i) => {
          const isEditing = editing === i
          const tools = (
            <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => (isEditing ? commitEdit() : startEdit(i))} aria-label={isEditing ? '고친 말 확인' : '이 말 고치기'} className="hit" style={roundBtn}>
                {isEditing
                  ? <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  : <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" /></svg>}
              </button>
              <button type="button" onClick={() => remove(i)} aria-label="이 말 지우기" className="hit" style={roundBtn}>
                <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </span>
          )
          const body = isEditing
            ? <textarea enterKeyHint="enter" autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => onEnter(e, commitEdit)} rows={2} maxLength={intro ? Math.min(500, 2000 - totalCharacters + turns[i]!.text.length) : 500}
                style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit' }} />
            : <span style={{ display: 'block', fontSize: 14 }}><Line text={t.text} /></span>

          if (t.role === 'narrator') {
            return (
              <li key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 6%' }}>
                <div style={{ width: '100%', textAlign: 'center', fontStyle: isEditing ? 'normal' : 'italic', color: 'var(--color-text-secondary)', ...(isEditing ? { padding: '6px 10px', ...box(true) } : {}) }}>{body}</div>
                {tools}
              </li>
            )
          }
          if (t.role === 'user') {
            return (
              <li key={i} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                {tools}
                <div style={{ maxWidth: '72%', flex: isEditing ? 1 : undefined, background: 'var(--color-surface-3)', borderRadius: 'var(--radius-md)', padding: '8px 12px', ...(isEditing ? box(true) : {}) }}>{body}</div>
              </li>
            )
          }
          return (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--color-surface-3)', flexShrink: 0, marginTop: 16 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{who}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ maxWidth: '80%', flex: isEditing ? 1 : undefined, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '8px 12px', ...(isEditing ? box(true) : {}) }}>{body}</div>
                  {tools}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      </div>
      {/* 입력 — 화자 고르기 → 한 마디 → 올리기 */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, ...(fill ? { flexShrink: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' } : {}) }}>
        <div role="radiogroup" aria-label="말하는 사람" style={{ display: 'flex', gap: 2 }}>
          {(intro ? (['narrator', 'character'] as const) : (['narrator', 'user', 'character'] as const)).map((r) => {
            const on = r === role
            return (
              <button key={r} type="button" role="radio" aria-checked={on} onClick={() => setRole(r)} onMouseDown={keepFocus}
                style={{
                  padding: '8px 10px', background: 'transparent', border: 0, cursor: 'pointer',
                  borderBottom: `2px solid ${on ? 'var(--color-white)' : 'transparent'}`,
                  fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                  color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}>
                {label(r)}
              </button>
            )
          })}
          <span className="t-micro" style={{ marginLeft: 'auto', alignSelf: 'center', textTransform: 'none', letterSpacing: 0, color: full ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>{turns.length}/{MAX_TURNS}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
          <textarea enterKeyHint="enter" ref={draftRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => onEnter(e, add)} rows={2} maxLength={Math.min(500, remaining)}
            placeholder={full ? '입력 한도에 도달했어요.' : role === 'narrator' ? '장면을 서술해요.' : `${label(role)}의 메시지 입력`} disabled={full} aria-label={`${label(role)}의 메시지`}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', ...box(false) }} />
          <button type="button" onClick={add} disabled={!draft.trim() || full} aria-label="올리기" onMouseDown={keepFocus}
            style={{
              width: 44, height: 44, borderRadius: 22, border: 0, flexShrink: 0, display: 'grid', placeItems: 'center',
              cursor: draft.trim() && !full ? 'pointer' : 'default',
              background: draft.trim() && !full ? 'var(--color-accent)' : 'var(--color-surface-2)',
              color: draft.trim() && !full ? 'var(--color-accent-on)' : 'var(--color-text-disabled)',
            }}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>엔터로 줄바꿈하고, ↑ 버튼을 눌러 올려 주세요.</p>
        {role !== 'narrator' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button type="button" onClick={wrapNarration} disabled={full} aria-label="서술 별표 넣기" onMouseDown={keepFocus} className="hit"
              style={{ padding: '3px 9px', borderRadius: 'var(--radius-sm)', border: 0, cursor: full ? 'default' : 'pointer', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)' }}>
              *서술*
            </button>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-secondary)' }}>별표 안은 옅은 서술로 보여요. 예) <em style={{ color: 'var(--color-text-tertiary)' }}>손을 흔들며</em> 하이~</span>
          </div>
        )}
      </div>
    </div>
  )
}
type Turn = { role: 'character' | 'user' | 'narrator'; text: string }
const MAX_TURNS = 20
const roundBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 14, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer',
  background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)',
}

/**
 * 미리 적어 둔 태그를 눌러서 고르고, 없는 건 + 로 직접 적는다 (분위기).
 * 저장은 CSV 한 칸 — TagInput 과 같은 모양이라 읽는 쪽이 같다.
 */
export function PresetTags({ name, label = '태그', options, max, maxLength = 20, defaultValue = [] }: {
  name: string; label?: string; options: readonly string[]; max: number; maxLength?: number; defaultValue?: string[]
}) {
  const [picked, setPicked] = useState<string[]>(defaultValue)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const reduce = useReducedMotion()
  const full = picked.length >= max
  const toggle = (o: string) => setPicked(picked.includes(o) ? picked.filter((v) => v !== o) : full ? picked : [...picked, o])
  const custom = picked.filter((v) => !options.includes(v))
  const addCustom = () => {
    const next = [...picked]
    for (const value of text.split(/[,·]/).map(value => value.trim().replace(/\s+/g, ' ').slice(0, maxLength)).filter(Boolean)) {
      if (next.length >= max) break
      if (!next.some(pickedValue => pickedValue.replace(/\s+/g, '').toLowerCase() === value.replace(/\s+/g, '').toLowerCase())) next.push(value)
    }
    setPicked(next); setText('')
  }
  const chip = (on: boolean, off: boolean): React.CSSProperties => ({
    minHeight: 44, padding: '6px 12px', cursor: off ? 'default' : 'pointer', borderRadius: 'var(--radius-button)',
    fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
    background: on ? 'var(--color-accent)' : 'var(--color-surface-2)',
    border: 0,
    color: on ? 'var(--color-white)' : off ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
  })
  return (
    <div role="group" aria-label={label}>
      <input type="hidden" name={name} value={picked.join(',')} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = picked.includes(o), off = !on && full
          return (
            <motion.button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on} disabled={off}
              whileTap={reduce || off ? undefined : { scale: 0.97 }} style={chip(on, off)}>
              {o}
            </motion.button>
          )
        })}
        {/* 직접 적은 태그 — 누르면 빠진다 */}
        {custom.map((o) => (
          <motion.button key={o} type="button" onClick={() => toggle(o)} aria-pressed aria-label={`${o} 빼기`}
            whileTap={reduce ? undefined : { scale: 0.97 }} style={{ ...chip(true, false), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {o}
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </motion.button>
        ))}
        <button type="button" onClick={() => setAdding((v) => !v)} disabled={full && !adding} aria-expanded={adding} aria-label="직접 입력"
          style={{ ...chip(false, full && !adding), display: 'inline-flex', alignItems: 'center', gap: 4, borderStyle: 'dashed', borderColor: 'var(--color-border-strong)' }}>
          <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          직접 입력
        </button>
      </div>
      {adding && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '6px 10px', ...box(true) }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={maxLength * max} placeholder="예) 재벌가, 첫사랑" autoFocus disabled={full}
            aria-label={`${label} 직접 입력`}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addCustom() } }}
            style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addCustom} disabled={!text.trim() || full} className="hit"
            style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 0, cursor: 'pointer', background: text.trim() && !full ? 'var(--color-accent)' : 'var(--color-surface-3)', color: text.trim() && !full ? 'var(--color-accent-on)' : 'var(--color-text-disabled)', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)' }}>
            추가
          </button>
        </div>
      )}
      <p className="t-micro" style={{ textAlign: 'right', marginTop: 8, textTransform: 'none', letterSpacing: 0, color: full ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>{picked.length}/{max}</p>
    </div>
  )
}

export type Step = { value: number; label: string; hint: string }

/**
 * 단계 선택 (레퍼런스 '난이도 · 전개 속도' 꼴). 슬라이더 대신 3–4단계 버튼 — 숫자는 감이 안 오고
 * '보통/예민함' 은 바로 읽힌다. 저장 값은 여전히 0–100 이다 (엔진·스키마 불변).
 * 고른 단계의 한 줄 설명이 밑에 붙는다. 기본값은 가장 가까운 단계로 맞춘다.
 */
export function Stepped({ name, label, options, defaultValue, value: controlled, onChange, pill = false }: {
  name: string; label: string; options: readonly Step[]; defaultValue: number; value?: number; onChange?: (value: number) => void; pill?: boolean
}) {
  const [localValue, setValue] = useState(defaultValue)
  const value = controlled ?? localValue
  const current = options.reduce((a, b) => Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a)
  const reduce = useReducedMotion()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-body" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)', marginBottom: 10 }}>{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div style={pill ? { display: 'flex', flexWrap: 'wrap', gap: 6 } : { display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
        {options.map((o) => {
          const on = o.value === current.value
          return (
            <motion.button key={o.value} type="button" onClick={() => { setValue(o.value); onChange?.(o.value) }} aria-pressed={on}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{
                minHeight: pill ? 32 : 40, padding: pill ? '4px 12px' : '8px 6px', cursor: 'pointer', borderRadius: pill ? 999 : 'var(--radius-button)',
                fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                background: on ? 'color-mix(in srgb, var(--color-accent) 16%, var(--color-surface-2))' : 'var(--color-surface-2)',
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

/**
 * 로어북 — 캐릭터가 아는 배경 지식. 키워드가 대화에 나온 턴에만 프롬프트에 실린다.
 *
 * 성격은 매 턴 들어가고(정체성) 로어는 불렸을 때만 들어간다(지식). 그래서 항목을 많이 적어도
 * 매 턴 값이 오르지 않는다 — 키워드를 비워 두면 "항상 실림" 이 되므로 그것만 주의한다.
 */
export function LoreEditor({ name, defaultValue = [] }: { name: string; defaultValue?: LoreItem[] }) {
  const [items, setItems] = useState<LoreItem[]>(defaultValue)
  const [keywords, setKeywords] = useState('')
  const [content, setContent] = useState('')
  const full = items.length >= MAX_LORE

  const add = () => {
    const text = content.trim()
    if (!text || full) return
    const keys = [...new Set(keywords.split(',').map((k) => k.trim()).filter(Boolean))].slice(0, MAX_LORE_KEYWORDS)
    setItems([...items, { keywords: keys, content: text.slice(0, MAX_LORE_CONTENT) }])
    setKeywords(''); setContent('')
  }
  const remove = (i: number) => setItems(items.filter((_, j) => j !== i))

  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length > 0 && (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
          {items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', ...box(false) }}>
              <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: item.keywords.length ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)' }}>
                  {item.keywords.length ? item.keywords.map((k) => `#${k}`).join(' ') : '항상 실림 (키워드 없음)'}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{item.content}</span>
              </div>
              <button type="button" onClick={() => remove(i)} aria-label="이 항목 지우기" className="hit" style={roundBtn}>
                <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="stack" style={{ gap: 8, padding: '10px 12px', ...box(false) }}>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="키워드 (쉼표로 구분) — 예) 민준, 사촌형"
            maxLength={120} autoComplete="off"
            style={{ width: '100%', background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14, fontFamily: 'inherit' }} />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} maxLength={MAX_LORE_CONTENT}
            placeholder="이 키워드가 나오면 캐릭터가 떠올릴 것 — 예) 민준은 세 살 위 사촌 형. 어릴 때 같이 살았고 지금은 연락이 뜸하다."
            style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{items.length}/{MAX_LORE}</span>
            <button type="button" onClick={add} disabled={!content.trim()} className="hit"
              style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 0, cursor: content.trim() ? 'pointer' : 'default',
                background: content.trim() ? 'var(--color-accent)' : 'var(--color-surface-3)', color: content.trim() ? 'var(--color-accent-on)' : 'var(--color-text-tertiary)', fontSize: 13 }}>
              추가
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export type LoreItem = { keywords: string[]; content: string }
const MAX_LORE = 24
const MAX_LORE_KEYWORDS = 8
const MAX_LORE_CONTENT = 600
