import { redirect } from 'next/navigation'
import { feature } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { Back, Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { voiceOptions } from '@/lib/voice'
import styles from '../characters/characters.module.css'
import { MakeTabs } from '../characters/make-tabs'

/**
 * 내 음성(10/28) — 캐릭터와 따로 만들고, 캐릭터 만들기의 '음성' 탭에서 고른다.
 * ponytail: 지금은 고를 수 있는 공식 음성 목록만 보인다. 사용자가 직접 음성을 만드는 흐름(녹음 올리기·동의·학습)은 모델 확정 뒤에 붙인다.
 */
export default async function MyVoices() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const t = await getT()
  const voices = feature('characterVoice') ? await voiceOptions() : []
  return (
    <Page wide className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}><Back href="/my" /><h1 className="sr-only">{t('내 음성')}</h1><MakeTabs active="voices" /></header>
        {voices.length === 0 ? (
          <section className={styles.empty} aria-label={t('음성 목록')}>
            <h2>{t('음성 만들기를 준비하고 있어요')}</h2>
            <p>{t('곧 내 캐릭터에 어울리는 목소리를 직접 만들 수 있어요.\n만든 음성은 캐릭터 만들기의 음성 탭에서 고를 수 있어요.')}</p>
          </section>
        ) : (
          <>
            <div className={styles.summary}><span>{t('{n}개', { n: voices.length })}</span></div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {voices.map(v => (
                <li key={v.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--color-border)', fontSize: 15 }}>{v.label}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Page>
  )
}
