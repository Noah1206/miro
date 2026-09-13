'use client'
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { duration, ease, press, spring, stagger } from '@/lib/motion/tokens'

export type TermsItem = { key: string; title: string; body: string; href: string }

/**
 * 동의는 실제로 눌러야 한다 — 체크하지 않으면 진행할 수 없다.
 * 한 줄은 [체크] 항목명 … [보기 >] 로, 체크와 전문 열기가 서로 다른 동작이므로 버튼도 둘로 나눈다.
 */
export function TermsList({ items, action }: { items: TermsItem[]; action: () => void }) {
  const reduce = useReducedMotion()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const all = items.every((i) => checked[i.key])
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }))
  const agreeAll = () => setChecked(Object.fromEntries(items.map((i) => [i.key, true])))

  return (
    <>
      <motion.ul className="stack" style={{ gap: 4, listStyle: 'none', padding: 0, margin: 0 }}
        initial={reduce ? false : 'hidden'} animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: stagger.loose, delayChildren: 0.15 } } }}>
        {items.map((item) => (
          <motion.li key={item.key}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } },
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckRow checked={Boolean(checked[item.key])} onToggle={() => toggle(item.key)} title={item.title} body={item.body} />
            <a href={item.href} target="_blank" rel="noreferrer" aria-label={`${item.title} 전문 보기`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </a>
          </motion.li>
        ))}
      </motion.ul>

      <div style={{ display: 'flex', gap: 10, marginTop: 'var(--space-6)' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {!all && (
            <motion.div key="agree-all" layout
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: duration.fast, ease: ease.exit } }}
              transition={spring.default} style={{ flex: 1 }}>
              <Button type="button" variant="secondary" size="lg" full onClick={agreeAll}>모두 동의</Button>
            </motion.div>
          )}
          <motion.form key="submit" layout action={action} transition={spring.default} style={{ flex: 1 }}>
            <Button type="submit" variant="primary" size="lg" full disabled={!all}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={all ? 'go' : 'wait'}
                  initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: duration.fast, ease: ease.exit } }}
                  transition={{ duration: duration.normal, ease: ease.enter }}
                  style={{ display: 'block' }}>
                  {all ? '다음으로 진행하기' : '동의하고 시작'}
                </motion.span>
              </AnimatePresence>
            </Button>
          </motion.form>
        </AnimatePresence>
      </div>
    </>
  )
}

/**
 * 체크 + 항목명이 하나의 버튼. 손이 닿는 순간 눌리고(scale 0.97) 떼면 스프링으로 돌아온다.
 * 켜질 때 체크 획이 그려지고 바탕이 한 번 부푼다 — 눌렀다는 사실이 눈에 남아야 한다.
 */
function CheckRow({ checked, onToggle, title, body }: { checked: boolean; onToggle: () => void; title: string; body: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
      whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
      style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
        background: 'transparent', border: 0, padding: '12px 4px', cursor: 'pointer',
        borderRadius: 'var(--radius-sm)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}>
      <span style={{ position: 'relative', width: 22, height: 22, flexShrink: 0, marginTop: 1 }}>
        <motion.span aria-hidden
          animate={{
            backgroundColor: checked ? 'var(--color-white)' : 'transparent',
            borderColor: checked ? 'var(--color-white)' : 'var(--color-border-strong)',
            scale: checked ? [1, 1.14, 1] : 1,
          }}
          transition={{ duration: reduce ? 0 : 0.34, ease: ease.enter, times: [0, 0.45, 1] }}
          style={{ position: 'absolute', inset: 0, borderRadius: 7, border: '1.5px solid', display: 'block' }} />
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="var(--color-black)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 4 }}>
          <motion.path d="M20 6 9 17l-5-5"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: ease.enter, delay: checked && !reduce ? 0.06 : 0 }} />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <motion.span className="t-body" animate={{ opacity: checked ? 1 : 0.72 }} transition={{ duration: duration.normal, ease: ease.enter }}
          style={{ display: 'block', fontWeight: 'var(--weight-semibold)', marginBottom: 4 }}>{title}</motion.span>
        <span className="t-caption" style={{ display: 'block' }}>{body}</span>
      </span>
    </motion.button>
  )
}
