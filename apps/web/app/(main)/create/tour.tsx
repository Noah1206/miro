'use client'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { tween } from '@/lib/motion/tokens'
import type { CreateTab } from './header'

const KEY = 'miro:tour:create'

/** 탭마다 한 문장. '다음' 이 탭도 같이 넘긴다 — 말풍선이 가리키는 곳을 보여준다. */
const STEPS: Array<{ tab: CreateTab; text: string }> = [
  { tab: 'profile', text: '이름과 소개 한 줄이면 시작할 수 있어요. 사진은 나중에 넣어도 돼요.' },
  { tab: 'personality', text: '어떤 사람인지 한 칸에 적어요. 특징·가치관·말투를 섞어도 돼요.' },
  { tab: 'appearance', text: '성별과 체형만 고르면 사진이 나와요. 얼굴·머리는 고급 설정에서.' },
  { tab: 'relationship', text: '처음 만났을 때 두 사람의 거리예요. 대화하면서 바뀝니다.' },
  { tab: 'contact', text: '앱을 닫아도 먼저 연락할지, 얼마나 자주 할지 정해요.' },
  { tab: 'intro', text: '첫 장면을 적으면 등록할 수 있어요. 소개 페이지에서 미리 보세요.' },
]

/**
 * 처음 만드는 사람을 위한 안내 — 만들기 화면에만 있다.
 * 작은 말풍선 하나가 1/6 부터 차례로 넘어가고, 닫거나 끝까지 보면 이 기기에서 다시 뜨지 않는다.
 * 서버에서는 그리지 않는다: 닫았는지는 브라우저만 알아서, 먼저 그리면 깜빡인다.
 */
export function CreateTour({ tab, onTab }: { tab: CreateTab; onTab: (t: CreateTab) => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true) } catch { setOpen(true) }
  }, [])
  // 탭을 직접 눌러도 그 탭의 말풍선으로 따라간다.
  useEffect(() => {
    const i = STEPS.findIndex((s) => s.tab === tab)
    if (i >= 0) setStep(i)
  }, [tab])

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
        <motion.div role="note" aria-label="안내"
          initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.16 } }} transition={tween.enter}
          style={{ position: 'relative', maxWidth: 300, marginTop: 'var(--space-4)', padding: '10px 12px 10px 14px',
            background: 'var(--color-surface-3)', borderRadius: 'var(--radius-md)' }}>
          {/* 말풍선 꼬리 — 탭 줄 아래를 가리킨다 */}
          <span aria-hidden style={{ position: 'absolute', top: -6, left: 18, width: 12, height: 12, background: 'var(--color-surface-3)', transform: 'rotate(45deg)', borderRadius: 2 }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <p key={step} className="t-caption" style={{ flex: 1, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>{STEPS[step]!.text}</p>
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
