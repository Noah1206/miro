'use client'
import type { CSSProperties, ReactNode } from 'react'
import { msg } from '@/lib/i18n'
import { MOODS, RELATIONS } from '@/lib/genres'
import { useT } from '@/lib/i18n/client'

function Block({ width = '100%', height, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} />
}

function Status({ label, children, className = 'page', style }: { label: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const t = useT()
  return <main id="main" className={className} role="status" aria-label={t(label)} aria-busy="true" style={style}>
    <div aria-hidden="true">{children}</div>
  </main>
}

export function CardGridSkeleton({ ratio = '10 / 16', count = 4 }: { ratio?: string; count?: number }) {
  return <div className="grid-2" aria-hidden="true" style={{ gap: 4, padding: '0 var(--gutter)' }}>
    {Array.from({ length: count }, (_, index) => <Block key={index} style={{ aspectRatio: ratio, borderRadius: 'var(--radius-lg)' }} />)}
  </div>
}

export function HomePageSkeleton() {
  return <Status label={msg('홈 불러오는 중')} className="page page--immersive page--wide" style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-5)' }}>
      <Block width={30} height={30} style={{ borderRadius: 10 }} /><Block width={38} height={38} style={{ borderRadius: 19 }} />
    </div>
    <div style={{ padding: '0 var(--gutter)' }}>
      {/* 장르·관계 섹션: 제목 + 한 줄 칩 */}
      {[MOODS, RELATIONS].map((chips, index) => <div key={index} style={{ marginBottom: 20 }}>
        <Block width={36} height={24} style={{ marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 6, overflow: 'hidden', margin: '0 calc(-1 * var(--gutter))', padding: '0 var(--gutter)' }}>
          {chips.map(chip => <Block key={chip} width={chip.length * 13 + 20} height={36} style={{ flexShrink: 0, borderRadius: 16 }} />)}
        </div>
      </div>)}
    </div>
    <CardGridSkeleton ratio="2 / 3" />
  </Status>
}

export function MiroPageSkeleton() {
  return <Status label={msg('미로 불러오는 중')} className="page page--immersive page--wide" style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))' }}>
    <div style={{ minHeight: 40, padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-4)' }}>
      <Block width={30} height={30} style={{ borderRadius: 10 }} />
    </div>
    <CardGridSkeleton />
  </Status>
}

export function ArchivePageSkeleton() {
  return <Status label={msg('대화 목록 불러오는 중')} className="page page--wide">
    <Block width={100} height={32} style={{ marginBottom: 24 }} />
    <Block height={52} style={{ marginBottom: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }} />
    {Array.from({ length: 3 }, (_, index) => <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 88, padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)' }}>
      <Block width={56} height={56} style={{ flexShrink: 0, borderRadius: 18 }} />
      <div style={{ flex: 1 }}><Block width="45%" height={19} style={{ marginBottom: 8 }} /><Block width="75%" height={14} /></div>
    </div>)}
  </Status>
}

export function CreatePageSkeleton() {
  return <Status label={msg('만들기 불러오는 중')}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56 }}>
      <Block width={36} height={36} style={{ borderRadius: 18 }} /><Block width={90} height={24} /><Block width={72} height={34} />
    </div>
    <div style={{ display: 'flex', gap: 12, overflow: 'hidden', padding: '12px 0 18px' }}>
      {Array.from({ length: 5 }, (_, index) => <Block key={index} width={64} height={24} style={{ flexShrink: 0 }} />)}
    </div>
    <Block width={72} height={22} style={{ marginBottom: 16 }} />
    <Block width={200} height={200} style={{ margin: '0 auto 24px', borderRadius: 'var(--radius-lg)' }} />
    {[0, 1, 2].map(index => <div key={index} style={{ marginBottom: 18 }}><Block width={64} height={16} style={{ marginBottom: 8 }} /><Block height={index === 2 ? 112 : 48} style={{ borderRadius: 'var(--radius-md)' }} /></div>)}
  </Status>
}

export function MyPageSkeleton() {
  // '나' 화면(2026-09-30) — 로고 → 프로필 줄 → 숫자 카드 → 크레딧 카드. 머리 위 여백은 홈 머리와 같게(10/1).
  return <Status label={msg('내 정보 불러오는 중')} className="page page--wide">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, margin: 'calc(var(--space-2) + env(safe-area-inset-top) - var(--space-5)) 0 var(--space-5)' }}>
      <Block width={30} height={30} style={{ borderRadius: 10 }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'var(--space-5)' }}>
      <Block width={64} height={64} style={{ flexShrink: 0, borderRadius: 32 }} />
      <div style={{ flex: 1 }}><Block width="45%" height={24} style={{ marginBottom: 8 }} /><Block width="60%" height={16} /></div>
      <Block width={32} height={32} style={{ flexShrink: 0, borderRadius: 16 }} />
    </div>
    <Block height={92} style={{ marginBottom: 'var(--space-4)', borderRadius: 16 }} />
    <Block height={140} style={{ borderRadius: 16 }} />
  </Status>
}
