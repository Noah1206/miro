'use client'
import type { contactProfiles, characterVisualIdentities } from '@miro/db'
import { BUILD_PRESETS, GENDER_PRESETS, type ContactChannel } from '@miro/domain'
import { S } from '@/lib/character-options'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import { deliverableChannel, type ContactCapabilities } from '@/lib/reality/channels'
import { Rule } from './sections'
import styles from './settings-view.module.css'
const step = (value: number, options: readonly { value: number; label: string }[]) =>
  options.reduce((best, option) => Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best).label

function Details({ rows }: { rows: [string, string | null | undefined][] }) {
  const t = useT()
  const visibleRows = rows.filter(([, value]) => value?.trim())
  const flow = (items: typeof visibleRows) => <dl style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
    {items.map(([label, value]) => <div key={label} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 7, minWidth: 0, padding: '7px 0',
    }}>
      <dt style={{ flexShrink: 0, fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-tertiary)' }}>{t(label)}</dt>
      <dd style={{
        margin: 0,
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        color: 'var(--color-text-primary)',
      }}>{value}</dd>
    </div>)}
  </dl>
  return <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)' }}>{flow(visibleRows)}</div>
}

export function CharacterSettingsView({ visual, contact, name, can }: { name: string; can: ContactCapabilities; visual?: Pick<typeof characterVisualIdentities.$inferSelect, 'bodyProfile' | 'baseFace' | 'hair' | 'styleTags' | 'expressionTendency'>; contact?: Pick<typeof contactProfiles.$inferSelect, 'enabled' | 'presentation' | 'contactFrequency' | 'initiativeLevel' | 'preferredChannel' | 'photoProbability' | 'voiceMessageProbability' | 'callProbability' | 'videoCallProbability'> }) {
  const t = useT()
  const appearance: [string, string | null | undefined][] = visual ? [
    [msg('성별'), visual.bodyProfile.gender ? t(GENDER_PRESETS[visual.bodyProfile.gender]?.label ?? '') : null],
    [msg('체형'), visual.bodyProfile.build ? t(BUILD_PRESETS[visual.bodyProfile.build]?.label ?? '') : null],
    [msg('키'), visual.bodyProfile.height], [msg('체형 설명'), visual.bodyProfile.detail],
    [msg('눈'), visual.baseFace.eyes], [msg('코'), visual.baseFace.nose], [msg('턱선'), visual.baseFace.jaw], [msg('피부'), visual.baseFace.skin], [msg('특징'), visual.baseFace.distinctive],
    [msg('머리 색'), visual.hair.color], [msg('머리 길이'), visual.hair.length], [msg('헤어스타일'), visual.hair.style],
    [msg('스타일'), visual.styleTags.join(' · ')], [msg('표정'), visual.expressionTendency],
  ] : []
  return <>
    {appearance.some(([, value]) => value?.trim()) && <Rule label={t('외형')}><Details rows={appearance} /></Rule>}
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
