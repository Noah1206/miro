import Link from 'next/link'

/** n12 — 첫 캐릭터 선택 안내. 공식 캐릭터 / 직접 만들기 두 경로만 제시한다. */
export default function Welcome() {
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                   justifyContent: 'center', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>어떻게 시작할까요?</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 36px' }}>
        나중에 언제든 다른 방법으로도 시작할 수 있습니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Choice href="/home" title="MIRO ORIGINALS"
                body="토마스 · 강태윤 · 히사시 — MIRO가 만든 캐릭터와 바로 시작합니다." primary />
        <Choice href="/create" title="캐릭터 만들기"
                body="한 문장으로 원하는 캐릭터와 세계를 만듭니다." />
      </div>
    </main>
  )
}

function Choice({ href, title, body, primary = false }: {
  href: string; title: string; body: string; primary?: boolean
}) {
  return (
    <Link href={href} style={{
      display: 'block', padding: 22, borderRadius: 'var(--radius)',
      background: primary ? 'var(--elevated)' : 'var(--surface)',
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
    }}>
      <h2 style={{ fontSize: 17, margin: '0 0 6px', fontWeight: 600 }}>{title}</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
        {body}
      </p>
    </Link>
  )
}
