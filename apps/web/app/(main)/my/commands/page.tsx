import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { isMinor } from '@/lib/payments/minor'
import { getT } from '@/lib/i18n/server'
import { SettingsPage } from '@/components/ui/settings-page'
import { CommandLibrary } from './library'

/**
 * 11/22 명령어 라이브러리 페이지 — 공개된 명령어 전부와 내 명령어를 찾아보고, 직접 만들고, 내가 올린 것을 내린다.
 * 그 전엔 만들기 화면·채팅방 `/` 목록 안에서만 볼 수 있었다. 서버 기능은 같은 것(create/commands.ts)을 쓴다.
 */
export default async function CommandsPage() {
  const user = await currentUser()
  if (!user) redirect('/login?next=%2Fmy%2Fcommands')
  const [t, minor] = await Promise.all([getT(), isMinor(user.id).catch(() => true)])
  return <SettingsPage title={t('명령어 라이브러리')}>
    <CommandLibrary adultAllowed={!minor} />
  </SettingsPage>
}
