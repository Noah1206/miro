import { Children, type ReactNode } from 'react'

/** 카드 안의 항목들을 가는 선으로 나눈다 (레퍼런스). 첫 항목 위에는 선이 없다. */
export function Rows({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  const items = Children.toArray(children)
  return (
    <div className="stack" style={{ gap: 0, ...style }}>
      {items.map((c, i) => (
        <div key={i} style={{ padding: i === 0 ? '0 0 16px' : '16px 0', borderTop: i === 0 ? 0 : '1px solid var(--color-border)' }}>
          {c}
        </div>
      ))}
    </div>
  )
}
