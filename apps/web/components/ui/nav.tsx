'use client'
import { motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { spring } from '@/lib/motion/tokens'
import { Sheet } from './sheet'
import { TransitionLink } from './transition-link'

/** 만들기가 한가운데 — 다섯 칸의 중심이 '새로 만드는 일' 이다 (레퍼런스). */
const ITEMS = [
  { href: '/home', label: '홈', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/discover', label: '발견', icon: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></> },
  { href: '/create', label: '만들기', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></> },
  { href: '/archive', label: '대화', icon: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /> },
  { href: '/my', label: '나', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></> },
]

/**
 * 조용한 내비게이션. 활성 = 흰 글자 + 라임 점, 비활성 = 회색.
 * 모바일: 하단. 데스크톱(≥1024): 왼쪽 세로. 활성 표시는 하나의 점이 이동한다(layoutId).
 * Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
 *
 * 만들기만 링크가 아니라 버튼이다 — 두 갈래(AI / 직접)를 시트에서 먼저 고르고 들어간다.
 */
export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  if (/^\/(chat|live|call)\//.test(pathname)) return null

  function go(mode: 'ai' | 'manual') {
    setPickerOpen(false)
    router.push(mode === 'manual' ? '/create?mode=manual' : '/create')
  }

  return (
    <>
      <nav aria-label="주요" className="nav">
        {ITEMS.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/')
          const inner = (
            <span className="nav__inner">
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
              <span style={{ fontSize: 'var(--font-caption)', letterSpacing: 0 }}>{it.label}</span>
              {active && <motion.span aria-hidden layoutId="nav-dot" transition={spring.default} style={{ position: 'absolute', top: -8, width: 4, height: 4, borderRadius: 2, background: 'var(--color-accent)' }} />}
            </span>
          )
          const color = active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'

          if (it.href === '/create') {
            return (
              <button key={it.href} type="button" className="nav__item" onClick={() => setPickerOpen(true)}
                aria-haspopup="dialog" aria-expanded={pickerOpen} aria-current={active ? 'page' : undefined}
                style={{ background: 'none', border: 0, cursor: 'pointer', color }}>
                {inner}
              </button>
            )
          }
          return (
            <TransitionLink key={it.href} href={it.href} aria-current={active ? 'page' : undefined} className="nav__item" style={{ color }}>
              {inner}
            </TransitionLink>
          )
        })}
      </nav>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="무엇부터 시작할까요?">
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
          어느 쪽으로 시작해도 같은 폼에서 마무리합니다.
        </p>
        <div className="stack" style={{ gap: 10 }}>
          <PickerRow
            title="AI 로 만들기"
            body="한 문장만 적으면 이름·성격·세계까지 채워 드려요."
            onClick={() => go('ai')}
            icon={<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></>} />
          <PickerRow
            title="직접 만들기"
            body="빈 폼에서 처음부터 직접 적습니다."
            onClick={() => go('manual')}
            icon={<><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M14 6l4 4" /></>} />
        </div>
      </Sheet>
    </>
  )
}

function PickerRow({ title, body, icon, onClick }: { title: string; body: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: 16, textAlign: 'left',
        // 시트 자체가 surface-2 라 같은 톤을 쓰면 줄이 보이지 않는다 — 한 단 올린다.
        background: 'var(--color-surface-3)', border: 0, borderRadius: 'var(--radius-md)', cursor: 'pointer',
        color: 'var(--color-text-primary)',
      }}>
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        {icon}
      </svg>
      <span className="stack" style={{ gap: 3 }}>
        <span className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{title}</span>
        <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{body}</span>
      </span>
    </button>
  )
}
