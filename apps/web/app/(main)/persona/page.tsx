import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
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
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back={toChat ? '/home' : '/my'} title={persona ? t('내 페르소나') : t('나를 소개해 주세요')}
        lead={persona ? t('캐릭터가 대화에서 알게 되는 내 모습이에요. 모든 캐릭터와의 대화에 쓰여요.')
          : t('대화를 시작하기 전에, 캐릭터가 알게 될 내 모습을 정해 주세요. 마이페이지에서 언제든 바꿀 수 있어요.')} />
      <PersonaForm initial={persona} next={next} submitLabel={toChat ? t('저장하고 대화하기') : t('저장')} />
    </Page>
  )
}
