'use client'
import type { contactProfiles, characterVisualIdentities } from '@miro/db'
import { type ContactChannel } from '@miro/domain'
import { S } from '@/lib/character-options'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import { deliverableChannel, type ContactCapabilities } from '@/lib/reality/channels'
import { Rule } from './sections'
import styles from './settings-view.module.css'
const step = (value: number, options: readonly { value: number; label: string }[]) =>
  options.reduce((best, option) => Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best).label

export function CharacterSettingsView({ visual, contact, name, can }: { name: string; can: ContactCapabilities; visual?: Pick<typeof characterVisualIdentities.$inferSelect, 'bodyProfile' | 'baseFace' | 'hair' | 'styleTags' | 'expressionTendency'>; contact?: Pick<typeof contactProfiles.$inferSelect, 'enabled' | 'presentation' | 'contactFrequency' | 'initiativeLevel' | 'preferredChannel' | 'photoProbability' | 'voiceMessageProbability' | 'callProbability' | 'videoCallProbability'> }) {
  const t = useT()
  return <>
    {/* 11/4: 상세의 '외형' 칸은 뺐다(사용자 요청). 외형 설정은 사진 생성·프롬프트에만 쓴다. */}
    {contact && <Rule label={t('연락')}>
      <div className={styles.contactCard}>
        <div className={styles.summary}>
          <strong>{contact.enabled ? t('먼저 연락하기 · 켜짐') : t('먼저 연락하기 · 꺼짐')}</strong>
          {contact.enabled && <dl className={styles.identity}>
            <div><dt>{t('발신자 표시')}</dt><dd>{contact.presentation.senderLabel || name}</dd></div>
            <div><dt>{t('선호 채널')}</dt><dd>{t(({ message: msg('메시지'), photo: msg('사진'), voice_message: msg('음성'), voice_call: msg('전화'), video_call: msg('영상통화') } as Record<string, string>)[deliverableChannel(contact.preferredChannel as ContactChannel, can)] || contact.preferredChannel)}</dd></div>
          </dl>}
        </div>
        {contact.enabled && <div className={styles.meters}>
          {([
            [msg('연락 빈도'), contact.contactFrequency, S.contactFrequency],
            [msg('주도성'), contact.initiativeLevel, S.initiativeLevel],
            ...(can.imageGeneration ? [[msg('사진'), contact.photoProbability, S.media] as const] : []),
            [msg('음성 메시지'), contact.voiceMessageProbability, S.media],
            // 꺼진 수단은 빈도도 보이지 않는다 — 운영에서 오지 않을 연락을 약속하지 않는다.
            ...(can.voiceCall ? [[msg('전화'), contact.callProbability, S.media] as const] : []),
            ...(can.videoCall ? [[msg('영상통화'), contact.videoCallProbability, S.media] as const] : []),
          ] as const).map(([label, value, options]) => {
            const amount = Math.max(0, Math.min(100, value))
            const description = t(step(value, options))
            return <div key={label} className={styles.meterRow}>
              <span className={styles.label}>{t(label)}</span>
              <div className={styles.track} role="meter" aria-label={t(label)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amount} aria-valuetext={description}>
                <span className={styles.fill} style={{ width: `${amount}%` }} />
              </div>
              <span className={styles.value}>{description}</span>
            </div>
          })}
        </div>}
      </div>
    </Rule>}
  </>
}
