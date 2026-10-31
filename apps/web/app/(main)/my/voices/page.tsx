import { redirect } from 'next/navigation'
import { feature } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { Back, Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { MAX_USER_VOICES, issueVoicePrompt, myVoices } from '@/lib/voice'
import styles from '../characters/characters.module.css'
import { MakeTabs } from '../characters/make-tabs'
import { VoiceStudio } from './voice-studio'

/**
 * 내 음성(10/28) — 캐릭터와 따로 만들고, 캐릭터 만들기의 '음성' 탭에서 고른다.
 * 10/31: 서버가 고른 문장을 읽어 녹음 → 동의 → 자동 미리 듣기 → 등록(Drama 3 참조 목소리, 학습 없음). 흐름은 lib/voice.ts.
 */
export default async function MyVoices() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const t = await getT()
  const ready = feature('characterVoice')
  const voices = ready ? await myVoices(user.id) : []
  return (
    <Page wide className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}><Back href="/my" /><h1 className="sr-only">{t('내 음성')}</h1><MakeTabs active="voices" /></header>
        {!ready ? (
          <section className={styles.empty} aria-label={t('음성 목록')}>
            <h2>{t('음성 만들기를 준비하고 있어요')}</h2>
            <p>{t('곧 내 캐릭터에 어울리는 목소리를 직접 만들 수 있어요.\n만든 음성은 캐릭터 만들기의 음성 탭에서 고를 수 있어요.')}</p>
          </section>
        ) : (
          <VoiceStudio voices={voices} max={MAX_USER_VOICES} prompt={issueVoicePrompt(user.id)} />
        )}
      </div>
    </Page>
  )
}
