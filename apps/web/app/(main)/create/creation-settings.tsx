'use client'

import { useState } from 'react'
import { stageLabel } from '@miro/domain'
import { S } from '@/lib/character-options'
import { STAGES } from './parse'
import { ChoiceChips, CountedInput, LabeledField, Stepped, Switch } from './form-parts'
import type { FormInitial } from './character-form'
import type { ContactCapabilities } from '@/lib/reality/channels'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

const PRESETS = [
  { stage: 'stranger', label: msg('낯선 사이'), hint: msg('서로를 알아가며 조심스럽게 대화를 시작해요.'), values: [30, 10, 60, 10, 20, 0] },
  { stage: 'acquaintance', label: msg('아는 사이'), hint: msg('서로 얼굴은 알지만 아직 알아가는 중이에요.'), values: [40, 15, 50, 15, 20, 0] },
  { stage: 'professional', label: msg('동료'), hint: msg('일로 신뢰를 쌓았지만 사적인 이야기는 조심해요.'), values: [55, 10, 50, 20, 35, 0] },
  { stage: 'friend', label: msg('친구'), hint: msg('편하게 이야기를 나누고 서로의 일상을 챙겨요.'), values: [70, 25, 25, 50, 60, 0] },
  { stage: 'ambiguous', label: msg('애매한 사이'), hint: msg('가깝지만 서로의 마음을 확신하지 못해요.'), values: [45, 45, 40, 35, 35, 15] },
  { stage: 'flirting', label: msg('썸'), hint: msg('서로에게 끌리지만 마음을 조금씩 확인해요.'), values: [55, 65, 35, 45, 40, 25] },
  { stage: 'rivalry', label: msg('라이벌'), hint: msg('서로를 인정하면서도 쉽게 지고 싶지 않아요.'), values: [40, 20, 55, 25, 15, 30] },
  { stage: 'distrust', label: msg('멀어진 사이'), hint: msg('함께한 시간은 있지만 지금은 믿음이 흔들려요.'), values: [15, 30, 75, 40, 25, 30] },
  { stage: 'conflict', label: msg('갈등 중'), hint: msg('아직 풀리지 않은 일이 두 사람 사이에 남아 있어요.'), values: [20, 30, 70, 45, 30, 40] },
  { stage: 'dating', label: msg('특별한 사이'), hint: msg('서로에게 특별하지만 관계를 정해 두지는 않았어요.'), values: [65, 70, 25, 60, 50, 20] },
  { stage: 'lover', label: msg('연인'), hint: msg('서로를 믿고 애정과 일상을 나눠요.'), values: [80, 80, 15, 75, 65, 25] },
]
/** 친해지는 곡선 (relationship/dynamics). 대화할수록 가까워지는 모양과 먼저 연락하는 시점이 달라진다. */
const BONDING = [
  { value: '', label: msg('자동'), hint: msg('다가가는 방식과 감정 표현에 맞춰 정해요.') },
  { value: 'accelerating', label: msg('빠르게'), hint: msg('처음엔 조심스럽지만, 가까워질수록 마음이 빠르게 열려요.') },
  { value: 'stepwise', label: msg('계단식'), hint: msg('평소엔 그대로지만, 특별한 순간마다 한 단계씩 가까워져요.') },
  { value: 'steady', label: msg('꾸준히'), hint: msg('대화할수록 조금씩 꾸준히 가까워져요.') },
  { value: 'slow', label: msg('아주 천천히'), hint: msg('마음을 여는 데 오래 걸려요.') },
] as const
const FIELDS = [
  ['trust', msg('신뢰')], ['attraction', msg('호감')], ['emotionalDistance', msg('정서적 거리')],
  ['attachment', msg('애착')], ['protectiveness', msg('보호 성향')], ['relJealousy', msg('질투')],
] as const
const RELATIONSHIP_OPTIONS = {
  trust: S.trust,
  attraction: S.attraction,
  emotionalDistance: [S.emotionalDistance[0], S.emotionalDistance[1], S.emotionalDistance[3]],
  attachment: [S.attachment[0], S.attachment[2], S.attachment[3]],
  protectiveness: [S.protectiveness[0], S.protectiveness[2], S.protectiveness[3]],
  relJealousy: [S.relJealousy[0], S.relJealousy[2]],
}

const caption = { color: 'var(--color-text-secondary)', marginTop: 10, lineHeight: 1.6 }
const smallButton = { border: 0, borderRadius: 8, background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', padding: '8px 12px', cursor: 'pointer' }

export function RelationshipSettings({ initial }: { initial: FormInitial }) {
  const [stage, setStage] = useState(initial.stage)
  const [bonding, setBonding] = useState(BONDING.some(b => b.value === initial.bonding) ? initial.bonding : '')
  const [values, setValues] = useState(() => FIELDS.map(([key]) => initial[key]))
  const [edited, setEdited] = useState(false)
  const [pending, setPending] = useState<(typeof PRESETS)[number] | null>(null)
  const t = useT()
  const matched = PRESETS.find(p => p.stage === stage && p.values.every((v, n) => v === values[n]))
  function apply(p: (typeof PRESETS)[number]) { setStage(p.stage); setValues([...p.values]); setEdited(false); setPending(null) }
  function choose(value: string) {
    const p = PRESETS.find(p => p.stage === value)!
    if (edited || !matched) setPending(p)
    else apply(p)
  }
  return <div>
    <ChoiceChips name="stage" pill value={stage} onChange={choose}
      options={PRESETS.map(p => ({ value: p.stage, label: t(p.label) }))} />
    <p className="t-caption" style={caption}>{matched ? t(matched.hint) : t('{stage} · 직접 설정한 관계로 시작해요.', { stage: t(stageLabel(STAGES.find(s => s === stage) ?? 'stranger')) })}</p>
    {pending && <div role="group" aria-label={t('관계 변경 방법')} style={{ marginTop: 16 }}>
      <p className="t-caption" style={caption}>{t('세부값을 유지할까요, {stage} 추천값으로 바꿀까요?', { stage: t(pending.label) })}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button type="button" style={smallButton} onClick={() => { setStage(pending.stage); setEdited(true); setPending(null) }}>{t('세부값 유지')}</button>
        <button type="button" style={smallButton} onClick={() => apply(pending)}>{t('추천값 적용')}</button>
        <button type="button" style={smallButton} onClick={() => setPending(null)}>{t('취소')}</button>
      </div>
    </div>}
    <section aria-label={t('가까워지는 속도')} style={{ marginTop: 24 }}>
      <h3 className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 10 }}>{t('가까워지는 속도')}</h3>
      <ChoiceChips name="bonding" pill value={bonding} onChange={setBonding} options={BONDING.map(b => ({ value: b.value, label: t(b.label) }))} />
      <p className="t-caption" style={caption}>{t(BONDING.find(b => b.value === bonding)!.hint)} {t('가까워질수록 먼저 연락하는 간격도 짧아져요.')}</p>
    </section>
    <div id="relationship-details" className="stack" style={{ gap: 20, marginTop: 24 }}>
      {[
        { title: msg('신뢰와 거리'), indices: [0, 2] },
        { title: msg('호감과 유대'), indices: [1, 3] },
        { title: msg('상대를 향한 감정'), indices: [4, 5] },
      ].map(group => <section key={group.title} aria-label={t(group.title)} style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
        <h3 className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>{t(group.title)}</h3>
        <div className="stack" style={{ gap: 20 }}>{group.indices.map(n => {
          const [key, label] = FIELDS[n]!
          return <Stepped key={key} name={key} label={label} defaultValue={initial[key]} value={values[n]!} options={RELATIONSHIP_OPTIONS[key]}
            onChange={value => { setValues(old => old.map((v, index) => index === n ? value : v)); setEdited(true) }} />
        })}</div>
      </section>)}
    </div>
  </div>
}

const FREQUENCY = [
  { value: 20, label: msg('드물게'), hint: msg('특별히 할 이야기가 생기면 먼저 연락해요.') },
  { value: 50, label: msg('가끔'), hint: msg('관계와 상황에 따라 안부를 건네요.') },
  { value: 80, label: msg('자주'), hint: msg('일상의 작은 일도 나누려는 편이에요.') },
]
export function ContactSettings({ initial: i, mode, capabilities }: { initial: FormInitial; mode: 'create' | 'edit'; capabilities: ContactCapabilities }) {
  const legacyChat = mode === 'edit' && i.experienceType === 'chat'
  const [enabled, setEnabled] = useState(!legacyChat && i.contactEnabled)
  const [changed, setChanged] = useState(false)
  const [frequency, setFrequency] = useState(i.contactFrequency)
  const t = useT()
  return <div>
    {/* 연락 방식은 작성자가 지정하지 않는다. 기존 캐릭터의 저장값은 편집 시 보존한다. */}
    <input type="hidden" name="preferredChannel" value={i.preferredChannel} />
    <input type="hidden" name="photoProbability" value={i.photoProbability} />
    <input type="hidden" name="voiceMessageProbability" value={i.voiceMessageProbability} />
    <input type="hidden" name="callProbability" value={i.callProbability} />
    <input type="hidden" name="videoCallProbability" value={i.videoCallProbability} />
    <input type="hidden" name="contactChanged" value={changed ? 'on' : ''} />
    <input type="hidden" name="contactEnabled" value={(legacyChat && !changed ? i.contactEnabled : enabled) ? 'on' : ''} />
    <input type="hidden" name="replyDelayMinutes" value={i.replyDelayMinutes} />
    <input type="hidden" name="activeHoursStart" value={i.activeHoursStart} />
    <input type="hidden" name="activeHoursEnd" value={i.activeHoursEnd} />
    <Switch name="contactToggle" checked={enabled} onChange={v => { setEnabled(v); setChanged(true) }} label={t('먼저 연락하기')}
      hint={t('대화하지 않는 동안에도 성격과 상황에 맞춰 먼저 연락해요.')} />
    {!capabilities.realityMessage && <p className="t-caption" style={caption}>{t('먼저 연락하기는 현재 준비 중이에요. 설정은 저장됩니다.')}</p>}
    {legacyChat && !changed && <p className="t-caption" style={caption}>{t('켜면 이 캐릭터도 리얼리티로 사용할 수 있어요.')}</p>}
    <div hidden={!enabled} style={{ marginTop: 24 }}>
      <Stepped name="contactFrequency" label={msg('연락 빈도')} defaultValue={i.contactFrequency} value={frequency} onChange={setFrequency} options={FREQUENCY} />
    </div>
    <div id="contact-details" hidden={!enabled} style={{ marginTop: 20 }}>
      <div className="stack" style={{ gap: 24, background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
        <Stepped name="initiativeLevel" label={msg('연락 주도성')} defaultValue={i.initiativeLevel} options={[
          { value: 20, label: msg('기다림'), hint: msg('먼저 다가가기보다 상대가 연락해 오기를 기다리는 편이에요.') },
          { value: 50, label: msg('보통'), hint: msg('안부가 궁금하거나 나눌 이야기가 생기면 먼저 연락하는 편이에요.') },
          { value: 80, label: msg('적극적'), hint: msg('상대의 연락을 기다리기보다 먼저 말을 걸고 대화를 시작하는 편이에요.') },
        ]} />
        <LabeledField label={t('연락할 때 표시할 이름')} hint={t('캐릭터가 연락할 때 보이는 발신자 이름이에요. 비워 두면 캐릭터 이름을 사용해요.')}><CountedInput name="senderLabel" max={30} defaultValue={i.senderLabel} placeholder={t('예) 알 수 없는 번호, 경호실')} /></LabeledField>
      </div>
    </div>
  </div>
}
