import type { CSSProperties, ReactNode } from 'react'

function Block({ width = '100%', height, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} />
}

function Status({ label, children, className = 'page', style }: { label: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return <main id="main" className={className} role="status" aria-label={label} aria-busy="true" style={style}>
    <div aria-hidden="true">{children}</div>
  </main>
}

export function CardGridSkeleton({ ratio = '10 / 16', count = 4 }: { ratio?: string; count?: number }) {
  return <div className="grid-2" aria-hidden="true" style={{ gap: 4, padding: '0 var(--gutter)' }}>
    {Array.from({ length: count }, (_, index) => <Block key={index} style={{ aspectRatio: ratio, borderRadius: 'var(--radius-lg)' }} />)}
  </div>
}

export function SearchResultsSkeleton() {
  return <div role="status" aria-label="검색 결과 불러오는 중" aria-busy="true"><CardGridSkeleton /></div>
}

export function HomePageSkeleton() {
  return <Status label="홈 불러오는 중" className="page page--immersive" style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-5)' }}>
      <Block width={30} height={30} style={{ borderRadius: 10 }} /><Block width={38} height={38} style={{ borderRadius: 19 }} />
    </div>
    <div style={{ padding: '0 var(--gutter)' }}>
      <Block width={116} height={34} style={{ marginBottom: 16, borderRadius: 9 }} />
      <Block width={88} height={24} style={{ marginBottom: 14 }} />
    </div>
    <CardGridSkeleton ratio="2 / 3" />
  </Status>
}

export function MiroPageSkeleton() {
  return <Status label="미로 불러오는 중" className="page page--immersive" style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
    <div style={{ minHeight: 40, padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-4)' }}>
      <Block width={30} height={30} style={{ borderRadius: 10 }} />
    </div>
    <CardGridSkeleton />
  </Status>
}

export function SearchPageSkeleton() {
  return <Status label="검색 불러오는 중" className="page page--immersive" style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
    <div style={{ padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-4)' }}>
      <Block width={40} height={40} style={{ borderRadius: 20 }} />
      <Block height={42} style={{ marginTop: 'var(--space-4)', borderRadius: 'var(--radius-md)' }} />
      <Block width={100} height={15} style={{ marginTop: 12, marginBottom: 8 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {Array.from({ length: 10 }, (_, index) => <Block key={index} width={index % 3 === 0 ? 74 : 58} height={32} style={{ borderRadius: 16 }} />)}
      </div>
    </div>
    <CardGridSkeleton />
  </Status>
}

export function ArchivePageSkeleton() {
  return <Status label="대화 목록 불러오는 중">
    <Block width={100} height={32} style={{ marginBottom: 24 }} />
    <Block height={52} style={{ marginBottom: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }} />
    {Array.from({ length: 3 }, (_, index) => <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 88, padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)' }}>
      <Block width={56} height={56} style={{ flexShrink: 0, borderRadius: 18 }} />
      <div style={{ flex: 1 }}><Block width="45%" height={19} style={{ marginBottom: 8 }} /><Block width="75%" height={14} /></div>
    </div>)}
  </Status>
}

export function CreatePageSkeleton() {
  return <Status label="만들기 불러오는 중">
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
  return <Status label="내 정보 불러오는 중">
    <div style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Block width={64} height={64} style={{ flexShrink: 0, borderRadius: 32 }} /><div style={{ flex: 1 }}><Block width="50%" height={23} style={{ marginBottom: 8 }} /><Block width="35%" height={16} /></div></div>
      <Block width="70%" height={18} style={{ marginTop: 18 }} />
    </div>
    <Block width={260} height={44} style={{ marginTop: 'var(--space-7)', marginBottom: 'var(--space-4)', borderRadius: 22 }} />
    <div className="grid-2" style={{ gap: 4 }}><Block style={{ aspectRatio: '10 / 16' }} /><Block style={{ aspectRatio: '10 / 16' }} /></div>
  </Status>
}
