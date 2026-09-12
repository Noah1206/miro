import Link from 'next/link'

/** n3, n4 — 스플래시·온보딩 + MIRO 핵심 가치. 긴 취향 설문은 넣지 않는다. */
const VALUES = [
  { title: '캐릭터와 세계를 직접', body: '원하는 외형·성격·세계관을 한 문장으로 만들거나 세밀하게 편집합니다.' },
  { title: '자유 역할극', body: '선택지가 아니라 대사·행동·묘사를 자유롭게 섞어 이어갑니다.' },
  { title: '앱을 닫아도 이어지는 관계', body: '세계와 관계는 계속 존재하고, 캐릭터가 먼저 연락하기도 합니다.' },
]

export default function Onboarding() {
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                   padding: '56px 24px 32px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 40, letterSpacing: '0.24em', fontWeight: 300, margin: '0 0 8px' }}>
        MIRO
      </h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 48px', fontSize: 15 }}>
        AI 캐릭터 세계 경험
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
        {VALUES.map((v) => (
          <section key={v.title} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 20,
          }}>
            <h2 style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 600 }}>{v.title}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
              {v.body}
            </p>
          </section>
        ))}
      </div>

      <Link href="/login" style={{
        display: 'block', textAlign: 'center', marginTop: 32, padding: '16px',
        background: 'var(--accent)', borderRadius: 'var(--radius)',
        fontWeight: 600, fontSize: 16,
      }}>
        시작하기
      </Link>
    </main>
  )
}
