import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { SettingsPage } from '@/components/ui/settings-page'
import { getPersona, personaNext } from '@/lib/persona'
import { PersonaForm } from './form'
import { getT } from '@/lib/i18n/server'

/**
 * 페르소나 — 캐릭터가 대화에서 알게 되는 내 모습(2026-09-29 결정). 채팅을 처음 진행할 때 채팅·문자 화면이 여기로 보내고,
 * 저장하면 그 대화로 돌아간다. 마이페이지에서 고칠 때도 같은 화면이다.
 */
export default async function PersonaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const next = personaNext((await searchParams).next)
  const persona = await getPersona(user.id)
  const toChat = next !== '/my'
  const t = await getT()
  return (
    <SettingsPage back={toChat ? '/home' : '/my'} title={persona ? t('내 페르소나') : t('나를 소개해 주세요')}>
      <PersonaForm initial={persona} next={next} submitLabel={toChat ? t('저장하고 대화하기') : t('저장')} />
    </SettingsPage>
  )
}
