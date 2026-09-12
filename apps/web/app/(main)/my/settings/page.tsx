import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, userSettings } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
import { SettingsForm } from './form'

export default async function SettingsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my" title="연락" lead="캐릭터가 언제, 어떻게 먼저 다가올 수 있는지." />
      <SettingsForm initial={{ pushEnabled: s?.pushEnabled ?? true, voiceCallEnabled: s?.voiceCallEnabled ?? true, videoCallEnabled: s?.videoCallEnabled ?? true, quietHoursEnabled: s?.quietHoursEnabled ?? true, quietHoursStart: s?.quietHoursStart ?? '23:00', quietHoursEnd: s?.quietHoursEnd ?? '08:00', timeZone: s?.timeZone ?? 'Asia/Seoul' }} />
    </Page>
  )
}
