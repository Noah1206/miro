import type { contactProfiles, characterVisualIdentities } from '@miro/db'
import { BUILD_PRESETS, GENDER_PRESETS } from '@miro/domain'
import { S } from '@/lib/character-options'
import { Rule } from './sections'
import styles from './settings-view.module.css'
const step = (value: number, options: readonly { value: number; label: string }[]) =>
  options.reduce((best, option) => Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best).label

function Details({ rows, avatar }: { rows: [string, string | null | undefined][]; avatar?: { src: string; alt: string } }) {
  const visibleRows = rows.filter(([, value]) => value?.trim())
  const flow = (items: typeof visibleRows) => <dl style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
    {items.map(([label, value]) => <div key={label} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 7, minWidth: 0, padding: '7px 0',
    }}>
      <dt style={{ flexShrink: 0, fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-tertiary)' }}>{label}</dt>
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
  if (!avatar) return <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)' }}>{flow(visibleRows)}</div>
  const summary = visibleRows.slice(0, 2)
  const rest = visibleRows.slice(2)
  return <div style={{ padding: 12, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
      {/* 체형 선택 화면과 같은 이미지를 써서 선택값과 소개 페이지가 어긋나지 않게 한다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar.src} alt={avatar.alt} width={120} height={160} loading="lazy" decoding="async" style={{
        width: 'clamp(94px, 27vw, 120px)', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', flexShrink: 0,
        borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)',
      }} />
      <dl style={{ margin: '44px 0 0', minWidth: 0 }}>
        <dt style={{ marginBottom: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>선택한 외형</dt>
        <dd style={{ margin: 0, fontSize: 20, lineHeight: 1.35, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
          {summary.map(([, value]) => value).join(' · ')}
        </dd>
      </dl>
    </div>
    {rest.length > 0 && <div style={{ marginTop: 10, padding: '6px 2px 0' }}>{flow(rest)}</div>}
  </div>
}

export function CharacterSettingsView({ visual, contact, name }: { name: string; visual?: Pick<typeof characterVisualIdentities.$inferSelect, 'bodyProfile' | 'baseFace' | 'hair' | 'styleTags' | 'expressionTendency'>; contact?: Pick<typeof contactProfiles.$inferSelect, 'enabled' | 'presentation' | 'contactFrequency' | 'initiativeLevel' | 'preferredChannel' | 'photoProbability' | 'voiceMessageProbability' | 'callProbability' | 'videoCallProbability'> }) {
  const gender = visual?.bodyProfile.gender
  const build = visual?.bodyProfile.build
  const bodyAvatar = gender && build
    ? { src: `/builds/${gender}-${build}.webp${build === "average" ? "?v=5" : ""}`, alt: `${name}의 ${GENDER_PRESETS[gender]?.label} ${BUILD_PRESETS[build]?.label} 체형` }
    : undefined
  const appearance: [string, string | null | undefined][] = visual ? [
    ['성별', visual.bodyProfile.gender ? GENDER_PRESETS[visual.bodyProfile.gender]?.label : null],
    ['체형', visual.bodyProfile.build ? BUILD_PRESETS[visual.bodyProfile.build]?.label : null],
    ['키', visual.bodyProfile.height], ['체형 설명', visual.bodyProfile.detail],
    ['눈', visual.baseFace.eyes], ['코', visual.baseFace.nose], ['턱선', visual.baseFace.jaw], ['피부', visual.baseFace.skin], ['특징', visual.baseFace.distinctive],
    ['머리 색', visual.hair.color], ['머리 길이', visual.hair.length], ['헤어스타일', visual.hair.style],
    ['스타일', visual.styleTags.join(' · ')], ['표정', visual.expressionTendency],
  ] : []
  return <>
    {appearance.some(([, value]) => value?.trim()) && <Rule label="외형"><Details rows={appearance} avatar={bodyAvatar} /></Rule>}
    {contact && <Rule label="연락" accent="#F15B62">
      <div className={styles.contactCard}>
        <div className={styles.summary}>
          <strong>먼저 연락하기 · {contact.enabled ? '켜짐' : '꺼짐'}</strong>
          {contact.enabled && <dl className={styles.identity}>
            <div><dt>발신자 표시</dt><dd>{contact.presentation.senderLabel || name}</dd></div>
            <div><dt>선호 채널</dt><dd>{({ message: '메시지', photo: '사진', voice_message: '음성', voice_call: '전화' } as Record<string, string>)[contact.preferredChannel] || contact.preferredChannel}</dd></div>
          </dl>}
        </div>
        {contact.enabled && <div className={styles.meters}>
          {([
            ['연락 빈도', contact.contactFrequency, S.contactFrequency],
            ['주도성', contact.initiativeLevel, S.initiativeLevel],
            ['사진', contact.photoProbability, S.media],
            ['음성 메시지', contact.voiceMessageProbability, S.media],
            ['전화', contact.callProbability, S.media],
            ['영상통화', contact.videoCallProbability, S.media],
          ] as const).map(([label, value, options]) => {
            const amount = Math.max(0, Math.min(100, value))
            const description = step(value, options)
            return <div key={label} className={styles.meterRow}>
              <span className={styles.label}>{label}</span>
              <div className={styles.track} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amount} aria-valuetext={description}>
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
