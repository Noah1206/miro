import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, userSettings } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { SettingsForm } from './form'

export default async function SettingsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 520, margin: '0 auto' }}>
      <Link href="/my" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 20, margin: '18px 0 20px' }}>알림 · 통화 · 야간 연락</h1>
      <SettingsForm initial={{
        pushEnabled: s?.pushEnabled ?? true, voiceCallEnabled: s?.voiceCallEnabled ?? true,
        videoCallEnabled: s?.videoCallEnabled ?? true, quietHoursEnabled: s?.quietHoursEnabled ?? true,
        quietHoursStart: s?.quietHoursStart ?? '23:00', quietHoursEnd: s?.quietHoursEnd ?? '08:00',
        timeZone: s?.timeZone ?? 'Asia/Seoul',
      }} />
    </main>
  )
}
