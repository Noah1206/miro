'use client'
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { duration, ease, press, spring, stagger } from '@/lib/motion/tokens'

export type TermsItem = { key: string; title: string; href: string }

/**
 * 동의는 실제로 눌러야 한다 — 체크하지 않으면 진행할 수 없다.
 * 박스 없이 체크 표시만 두고, 꺼져 있으면 옅은 회색 / 켜지면 흰색이다.
 */
export function TermsList({ items, action }: { items: TermsItem[]; action: () => void }) {
  const reduce = useReducedMotion()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const all = items.every((i) => checked[i.key])
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }))
  const agreeAll = () => setChecked(Object.fromEntries(items.map((i) => [i.key, true])))

  return (
    <>
      <motion.ul className="stack" style={{ gap: 2, listStyle: 'none', padding: 0, margin: 0 }}
        initial={reduce ? false : 'hidden'} animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: stagger.loose, delayChildren: 0.15 } } }}>
        {items.map((item) => (
          <motion.li key={item.key}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } },
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CheckRow checked={Boolean(checked[item.key])} onToggle={() => toggle(item.key)} title={item.title} />
            <a href={item.href} target="_blank" rel="noreferrer" aria-label={`${item.title} 전문 보기`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </a>
          </motion.li>
        ))}
      </motion.ul>

      {/* CTA 는 위아래로. 위가 진행, 아래가 한 번에 동의. */}
      <div className="stack" style={{ gap: 4, marginTop: 'var(--space-7)' }}>
        <form action={action}>
          <Button type="submit" variant="primary" size="lg" full disabled={!all}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={all ? 'go' : 'wait'}
                initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: duration.fast, ease: ease.exit } }}
                transition={{ duration: duration.normal, ease: ease.enter }}
                style={{ display: 'block' }}>
                {all ? '다음으로 진행하기' : '동의하고 가입하기'}
              </motion.span>
            </AnimatePresence>
          </Button>
        </form>
        <AnimatePresence initial={false}>
          {!all && (
            <motion.div key="agree-all"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, transition: { duration: duration.fast, ease: ease.exit } }}
              transition={spring.default} style={{ overflow: 'hidden' }}>
              <Button type="button" variant="ghost" size="lg" full onClick={agreeAll}>모두 동의하고 가입하기</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

/**
 * 체크 표시 + 항목명이 하나의 버튼. 손이 닿는 순간 눌리고(scale 0.97) 떼면 스프링으로 돌아온다.
 * 켜질 때 획이 그려지며 회색에서 흰색으로 바뀐다 — 눌렀다는 사실이 눈에 남아야 한다.
 */
function CheckRow({ checked, onToggle, title }: { checked: boolean; onToggle: () => void; title: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
      whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
      style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        background: 'transparent', border: 0, padding: '12px 4px', minHeight: 48, cursor: 'pointer',
        borderRadius: 'var(--radius-sm)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}>
      <motion.svg aria-hidden viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        animate={{ stroke: checked ? 'var(--color-white)' : 'var(--color-border-strong)', scale: checked ? [1, 1.18, 1] : 1 }}
        transition={{ duration: reduce ? 0 : 0.34, ease: ease.enter, times: [0, 0.45, 1] }}
        style={{ width: 20, height: 20, flexShrink: 0 }}>
        <path d="M20 6 9 17l-5-5" />
      </motion.svg>
      <motion.span className="t-body"
        animate={{ color: checked ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
        transition={{ duration: duration.normal, ease: ease.enter }}
        style={{ flex: 1, minWidth: 0 }}>{title}</motion.span>
    </motion.button>
  )
}
