import { redirect } from 'next/navigation'
import { feature } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { Back, Page, TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { MAX_USER_VOICES, issueVoicePrompt, myVoices } from '@/lib/voice'
import styles from '../characters/characters.module.css'
import { MakeTabs } from '../characters/make-tabs'
import { VoiceStudio } from './voice-studio'
import { voiceRewardSummary, VOICE_REWARD_RATE } from '@/lib/usage/creator-reward'

/**
 * 내 음성(10/28) — 캐릭터와 따로 만들고, 캐릭터 만들기의 '음성' 탭에서 고른다.
 * 10/31: 서버가 고른 문장을 읽어 녹음 → 동의 → 자동 미리 듣기 → 등록(Drama 3 참조 목소리, 학습 없음). 흐름은 lib/voice.ts.
 */
export default async function MyVoices() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const t = await getT()
  const ready = feature('characterVoice')
  const [voices, reward] = await Promise.all([ready ? myVoices(user.id) : [], voiceRewardSummary(user.id)])
  return (
    <Page wide className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}><Back href="/my" /><h1 className="sr-only">{t('내 음성')}</h1><MakeTabs active="voices" /></header>
        {/* 11/12 목소리 보상 — 다른 사람이 내가 공개한 목소리로 답을 들으면 그 턴에 쓴 토큰의 일부가 쌓인다(작품 보상과 같은 지갑). */}
        <section aria-label={t('목소리 보상')} style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '4px 0 12px', padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
          <img src="/miro-token.svg" alt="" aria-hidden width={28} height={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 15 }}>{t('목소리 보상')}</strong>
            <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('다른 사람이 내가 공개한 목소리로 답을 들으면 쓴 토큰의 {rate}%가 내 지갑에 쌓여요.', { rate: Math.round(VOICE_REWARD_RATE * 100) })}</span>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <strong style={{ display: 'block', fontSize: 17 }}>{t('이번 달 {n}', { n: reward.month.toLocaleString('ko-KR') })}</strong>
            <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('누적 {n}', { n: reward.total.toLocaleString('ko-KR') })}</span>
            <TransitionLink href="/earnings" className="t-caption" style={{ display: 'block', marginTop: 2, color: 'var(--color-accent)', fontWeight: 600 }}>{t('수익 지갑')}</TransitionLink>
          </div>
        </section>
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
