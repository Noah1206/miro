import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { and, isNull, sql } from 'drizzle-orm'
import { db, pushSubscriptions, userSettings } from '@miro/db'
import { currentUser, requireUser } from '@/lib/auth'
import { Page, PageHeader, Stagger, StaggerItem } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { PushSubscribe } from '@/components/push-subscribe'
import { TestPushButton } from './test-push-button'

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
  const [devices] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), isNull(pushSubscriptions.failedAt)))
  const items = [
    { kind: 'mic' as const, label: '마이크', why: '음성통화에서 목소리를 전달할 때만 사용합니다.', at: s?.micConsentAt },
    { kind: 'camera' as const, label: '카메라', why: '영상통화에서 사용자의 화면을 표시할 때만 사용합니다.', at: s?.cameraConsentAt },
    { kind: 'image' as const, label: '이미지 업로드', why: 'Face Cast 참고 이미지로만 사용하며, 실존 인물 기반 성적 표현에는 사용하지 않습니다.', at: s?.imageUploadConsentAt },
  ]
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my" title="권한" lead="각 권한은 아래 용도로만 쓰이며, 동의 전에는 사용하지 않습니다." />
      <Stagger className="stack" style={{ gap: 10 }}>
        {/* 알림: 캐릭터가 앱 밖에서 먼저 연락하는 길. 이 기기에서 켜고, 켠 기기 전부에 확인용 알림을 보내 볼 수 있다 (2026-09-29). */}
        <StaggerItem>
          <section data-push-section style={{ padding: 18, background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
            <p className="t-title-3">알림</p>
            <p className="t-caption" style={{ margin: '4px 0 12px' }}>캐릭터가 문자나 전화로 먼저 연락할 때 씁니다. 앱을 닫아도 받으려면 기기마다 한 번 켜 주세요.</p>
            <p data-push-devices={devices?.n ?? 0} className="t-caption" style={{ marginBottom: 12, color: 'var(--color-text-secondary)' }}>알림을 켠 기기 · {devices?.n ?? 0}대</p>
            <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name="캐릭터" />
            <TestPushButton />
          </section>
        </StaggerItem>
        {items.map((i) => (
          <StaggerItem key={i.kind}>
            <section style={{ padding: 18, background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
              <p className="t-title-3">{i.label}</p>
              <p className="t-caption" style={{ margin: '4px 0 12px' }}>{i.why}</p>
              {i.at ? <p data-consent={i.kind} className="t-caption" style={{ color: 'var(--color-success)' }}>동의함 · {i.at.toLocaleDateString('ko-KR')}</p>
                : <form action={consent.bind(null, i.kind)}><SubmitButton size="sm" variant="secondary">동의</SubmitButton></form>}
            </section>
          </StaggerItem>
        ))}
      </Stagger>
    </Page>
  )
}
