import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, userSettings } from '@miro/db'
import { currentUser, requireUser } from '@/lib/auth'

async function consent(kind: 'camera' | 'mic' | 'image') {
  'use server'
  const user = await requireUser()
  const col = kind === 'camera' ? { cameraConsentAt: new Date() } : kind === 'mic' ? { micConsentAt: new Date() } : { imageUploadConsentAt: new Date() }
  await db.insert(userSettings).values({ userId: user.id, ...col }).onConflictDoUpdate({ target: userSettings.userId, set: col })
}

/** n67 — 권한 동의 안내. 카메라·마이크·이미지 업로드는 명시적 동의 후에만 사용한다 (명세서 7.1). */
export default async function PermissionsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  const items = [
    { kind: 'mic' as const, label: '마이크', why: '음성통화에서 목소리를 전달할 때만 사용합니다.', at: s?.micConsentAt },
    { kind: 'camera' as const, label: '카메라', why: '영상통화에서 사용자의 화면을 표시할 때만 사용합니다.', at: s?.cameraConsentAt },
    { kind: 'image' as const, label: '이미지 업로드', why: 'Face Cast 참고 이미지로만 사용하며, 실존 인물 기반 성적 표현에는 사용하지 않습니다.', at: s?.imageUploadConsentAt },
  ]
  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 520, margin: '0 auto' }}>
      <Link href="/my" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 20, margin: '18px 0 6px' }}>권한 안내</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>각 권한은 아래 용도로만 쓰이며, 동의 전에는 사용하지 않습니다. 브라우저 권한 요청은 동의 후 해당 기능에서 표시됩니다.</p>
      {items.map((i) => (
        <section key={i.kind} style={{ padding: 16, marginBottom: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>{i.label}</p>
          <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{i.why}</p>
          {i.at ? <p data-consent={i.kind} style={{ margin: 0, fontSize: 12, color: 'var(--accent-strong)' }}>동의함 · {i.at.toLocaleDateString('ko-KR')}</p>
            : <form action={consent.bind(null, i.kind)}><button type="submit" style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12.5, cursor: 'pointer' }}>동의</button></form>}
        </section>
      ))}
    </main>
  )
}
