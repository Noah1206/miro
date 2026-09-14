'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { tween } from '@/lib/motion/tokens'
import type { CreateTab } from './header'

const KEY = 'miro:tour:create'

/**
 * 탭마다 두세 문장. 문장마다 줄을 바꾸고, 줄 안에서는 접지 않는다 — 한 줄은 22자 안쪽으로.
 * '다음' 이 탭도 같이 넘긴다 — 말풍선이 가리키는 곳을 보여준다.
 */
const STEPS: Array<{ tab: CreateTab; lines: string[] }> = [
  { tab: 'profile', lines: ['이름과 소개만 있으면 시작할 수 있어요.', '사진은 나중에 넣어도 돼요.', '나이·직업은 비워도 됩니다.'] },
  { tab: 'personality', lines: ['어떤 사람인지 한 칸에 적어요.', '특징, 가치관, 말투를 섞어 써도 돼요.', '질투·주도성은 아래에서 단계로 고릅니다.'] },
  { tab: 'appearance', lines: ['성별과 체형만 고르면 사진이 나와요.', '얼굴과 머리는 고급 설정에서 정해요.', '비워 두면 알아서 채웁니다.'] },
  { tab: 'relationship', lines: ['처음 만났을 때 두 사람의 거리예요.', '대화하면서 조금씩 바뀝니다.', '키워드는 카드에 해시태그로 붙어요.'] },
  { tab: 'contact', lines: ['앱을 닫아도 먼저 연락할지 정해요.', '얼마나 자주, 어떤 방법으로 올지도요.', '끄면 어떤 이유로도 먼저 오지 않아요.'] },
  { tab: 'intro', lines: ['첫 장면을 적으면 등록할 수 있어요.', '상황 예시는 소개 페이지에 실립니다.', '소개 페이지 탭에서 미리 보세요.'] },
]

/**
 * 처음 만드는 사람을 위한 안내 — 만들기 화면에만 있다.
 * 말풍선 하나가 1/6 부터 차례로 넘어가며 지금 탭 아래에 꼬리를 둔다.
 * 닫거나 끝까지 보면 이 기기에서 다시 뜨지 않는다.
 * 서버에서는 그리지 않는다: 닫았는지는 브라우저만 알아서, 먼저 그리면 깜빡인다.
 */
export function CreateTour({ tab, onTab }: { tab: CreateTab; onTab: (t: CreateTab) => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [pos, setPos] = useState({ left: 0, caret: 18 })
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true) } catch { setOpen(true) }
  }, [])
  // 탭을 직접 눌러도 그 탭의 말풍선으로 따라간다.
  useEffect(() => {
    const i = STEPS.findIndex((s) => s.tab === tab)
    if (i >= 0) setStep(i)
  }, [tab])

  // 꼬리를 지금 탭의 가운데 아래에 둔다. 탭 줄이 스크롤되거나 창이 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    if (!open) return
    const el = document.querySelector<HTMLElement>(`[role="tab"][aria-controls="panel-${STEPS[step]!.tab}"]`)
    const bubble = ref.current
    const parent = bubble?.parentElement
    if (!el || !bubble || !parent) return
    const place = () => {
      const cx = el.getBoundingClientRect().left + el.offsetWidth / 2
      const p = parent.getBoundingClientRect()
      const bw = bubble.offsetWidth
      const left = Math.max(0, Math.min(cx - p.left - 24, p.width - bw))
      const caret = Math.max(10, Math.min(cx - p.left - left - 6, bw - 22))
      setPos({ left, caret })
    }
    place()
    const list = el.closest('[role="tablist"]')
    list?.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    return () => { list?.removeEventListener('scroll', place); window.removeEventListener('resize', place) }
  }, [open, step])

  function dismiss() {
    setOpen(false)
    try { localStorage.setItem(KEY, '1') } catch { /* 저장 못 해도 이번엔 닫힌다 */ }
  }
  function next() {
    if (step >= STEPS.length - 1) return dismiss()
    const s = STEPS[step + 1]!
    setStep(step + 1)
    onTab(s.tab)
  }
  const last = step >= STEPS.length - 1

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div ref={ref} role="note" aria-label="안내"
          initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.16 } }} transition={tween.enter}
          style={{ position: 'relative', width: 'fit-content', maxWidth: '100%', marginTop: 'var(--space-4)', marginLeft: pos.left,
            padding: '10px 12px 10px 14px', background: 'var(--color-surface-3)', borderRadius: 'var(--radius-md)',
            transition: 'margin-left var(--motion-fast) var(--ease-standard)' }}>
          {/* 말풍선 꼬리 — 지금 탭 아래 */}
          <span aria-hidden style={{ position: 'absolute', top: -6, left: pos.caret, width: 12, height: 12, background: 'var(--color-surface-3)', transform: 'rotate(45deg)', borderRadius: 2,
            transition: 'left var(--motion-fast) var(--ease-standard)' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <p key={step} className="t-caption" style={{ flex: 1, margin: 0, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
              {STEPS[step]!.lines.map((line) => <span key={line} style={{ display: 'block', whiteSpace: 'nowrap' }}>{line}</span>)}
            </p>
            <button type="button" onClick={dismiss} aria-label="안내 닫기"
              style={{ flexShrink: 0, background: 'none', border: 0, padding: 2, marginRight: -4, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-secondary)' }}>{step + 1}/{STEPS.length}</span>
            <button type="button" onClick={next}
              style={{ padding: '5px 12px', borderRadius: 'var(--radius-button)', border: 0, cursor: 'pointer',
                background: 'var(--color-accent)', color: 'var(--color-accent-on)', fontSize: 'var(--font-micro)', fontWeight: 'var(--weight-semibold)' }}>
              {last ? '완료' : '다음'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
