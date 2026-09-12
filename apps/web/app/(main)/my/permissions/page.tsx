import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, userSettings } from '@miro/db'
import { currentUser, requireUser } from '@/lib/auth'
import { Button, Page, PageHeader, Stagger, StaggerItem } from '@/components/ui'

async function consent(kind: 'camera' | 'mic' | 'image') {
  'use server'
  const user = await requireUser()
  const col = kind === 'camera' ? { cameraConsentAt: new Date() } : kind === 'mic' ? { micConsentAt: new Date() } : { imageUploadConsentAt: new Date() }
  await db.insert(userSettings).values({ userId: user.id, ...col }).onConflictDoUpdate({ target: userSettings.userId, set: col })
}
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
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my" title="권한" lead="각 권한은 아래 용도로만 쓰이며, 동의 전에는 사용하지 않습니다." />
      <Stagger className="stack" style={{ gap: 10 }}>
        {items.map((i) => (
          <StaggerItem key={i.kind}>
            <section style={{ padding: 18, background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
              <p className="t-title-3">{i.label}</p>
              <p className="t-caption" style={{ margin: '4px 0 12px' }}>{i.why}</p>
              {i.at ? <p data-consent={i.kind} className="t-caption" style={{ color: 'var(--color-success)' }}>동의함 · {i.at.toLocaleDateString('ko-KR')}</p>
                : <form action={consent.bind(null, i.kind)}><Button type="submit" size="sm" variant="secondary">동의</Button></form>}
            </section>
          </StaggerItem>
        ))}
      </Stagger>
    </Page>
  )
}
