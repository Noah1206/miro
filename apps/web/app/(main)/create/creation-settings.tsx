'use client'

import { useState } from 'react'
import { stageLabel } from '@miro/domain'
import { STAGES } from './parse'
import { ChoiceChips, CountedInput, LabeledField, Stepped, Switch } from './form-parts'
import { StepSlider } from './settings-controls'
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
/** 10/28 밀러의 법칙: 11개를 한 줄로 늘어놓지 않고 이름 붙인 세 덩어리(3~5개씩)로 끊어 보인다. */
const GROUPS = [
  { key: 'new', label: msg('처음 만남'), stages: ['stranger', 'acquaintance', 'professional'] },
  { key: 'close', label: msg('가까운 사이'), stages: ['friend', 'ambiguous', 'flirting', 'dating', 'lover'] },
  { key: 'tense', label: msg('엇갈린 사이'), stages: ['rivalry', 'distrust', 'conflict'] },
] as const
/** 친해지는 곡선 (relationship/dynamics). 대화할수록 가까워지는 모양과 먼저 연락하는 시점이 달라진다. */
const BONDING = [
  { value: '', label: msg('자동'), hint: msg('다가가는 방식과 감정 표현에 맞춰 정해요.') },
  { value: 'accelerating', label: msg('빠르게'), hint: msg('처음엔 조심스럽지만, 가까워질수록 마음이 빠르게 열려요.') },
  { value: 'stepwise', label: msg('계단식'), hint: msg('평소엔 그대로지만, 특별한 순간마다 한 단계씩 가까워져요.') },
  { value: 'steady', label: msg('꾸준히'), hint: msg('대화할수록 조금씩 꾸준히 가까워져요.') },
  { value: 'slow', label: msg('아주 천천히'), hint: msg('마음을 여는 데 오래 걸려요.') },
] as const
const BONDING_BAR = ['', 'slow', 'steady', 'stepwise', 'accelerating'] as const
/** 프리셋 values 의 순서와 같다. */
const FIELDS = [['trust'], ['attraction'], ['emotionalDistance'], ['attachment'], ['protectiveness'], ['relJealousy']] as const

const caption = { color: 'var(--color-text-secondary)', marginTop: 10, lineHeight: 1.6 }
/**
 * 시작 관계 — 단계 칩과 가까워지는 속도만 고른다(10/19: 세부 감정 6개 삭제). 세부값은 고른 단계의 추천값을 hidden 으로 보낸다.
 * 편집 화면에서 저장된 값이 추천값과 다르면 단계를 다시 고르기 전까지 그 값을 그대로 둔다.
 */
export function RelationshipSettings({ initial }: { initial: FormInitial }) {
  const [stage, setStage] = useState(initial.stage)
  const [bonding, setBonding] = useState(BONDING.some(b => b.value === initial.bonding) ? initial.bonding : '')
  const [values, setValues] = useState(() => FIELDS.map(([key]) => initial[key]))
  const t = useT()
  const matched = PRESETS.find(p => p.stage === stage && p.values.every((v, n) => v === values[n]))
  function choose(value: string) {
    const p = PRESETS.find(p => p.stage === value)!
    setStage(p.stage); setValues([...p.values])
  }
  return <div>
    {FIELDS.map(([key], n) => <input key={key} type="hidden" name={key} value={values[n]!} />)}
    <input type="hidden" name="stage" value={stage} />
    {/* 10/28: 시작 관계 세 덩어리 + 가까워지는 속도를 카드 하나로 묶는다(연락 카드와 같은 꼴). */}
    <div style={{ display: 'grid', gap: 20, padding: 16, borderRadius: 16, border: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-lavender-300) 4%, transparent)' }}>
      {GROUPS.map(g => (
        <div key={g.key}>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{t(g.label)}</p>
          <ChoiceChips pill value={stage} onChange={choose}
            options={PRESETS.filter(p => (g.stages as readonly string[]).includes(p.stage)).map(p => ({ value: p.stage, label: t(p.label) }))} />
        </div>
      ))}
      <section aria-label={t('가까워지는 속도')} style={{ paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
        <p className="t-body" style={{ fontWeight: 'var(--weight-medium)', marginBottom: 4 }}>{t('가까워지는 속도')}</p>
        {/* 칩 대신 단계 막대 — 자동 다음 느린 쪽부터 빠른 쪽으로. */}
        <StepSlider name="bonding" label={t('가까워지는 속도')} value={bonding} onChange={v => setBonding(v as typeof bonding)}
          steps={BONDING_BAR.map(v => ({ value: v, label: t(BONDING.find(b => b.value === v)!.label) }))} />
      </section>
    </div>
  </div>
}

const INITIATIVE = [
  { value: 20, label: msg('기다림'), hint: msg('먼저 다가가기보다 상대가 연락해 오기를 기다리는 편이에요.') },
  { value: 50, label: msg('보통'), hint: msg('안부가 궁금하거나 나눌 이야기가 생기면 먼저 연락하는 편이에요.') },
  { value: 80, label: msg('적극적'), hint: msg('상대의 연락을 기다리기보다 먼저 말을 걸고 대화를 시작하는 편이에요.') },
]
/** 10/28: 5단계로 세분. */
const FREQUENCY = [
  { value: 10, label: msg('아주 드물게') },
  { value: 30, label: msg('드물게') },
  { value: 50, label: msg('가끔') },
  { value: 70, label: msg('자주') },
  { value: 90, label: msg('아주 자주') },
]
export function ContactSettings({ initial: i, mode, capabilities }: { initial: FormInitial; mode: 'create' | 'edit'; capabilities: ContactCapabilities }) {
  const legacyChat = mode === 'edit' && i.experienceType === 'chat'
  const [enabled, setEnabled] = useState(!legacyChat && i.contactEnabled)
  const [changed, setChanged] = useState(false)
  // 가장 가까운 단계로 맞춘다(옛 저장값이 20·50·80 이 아닐 수 있다).
  const snap = (v: number, steps: ReadonlyArray<{ value: number }>) => String(steps.map(o => o.value).reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a))
  const [frequency, setFrequency] = useState(snap(i.contactFrequency, FREQUENCY))
  const [initiative, setInitiative] = useState(snap(i.initiativeLevel, INITIATIVE))
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
    {/* 10/28: 칸 버튼 대신 단계 막대, 한 카드에 모은다(분류·설정 탭과 같은 꼴). */}
    <div id="contact-details" hidden={!enabled} style={{ marginTop: 20 }}>
      <div style={{ display: 'grid', gap: 24, padding: 16, borderRadius: 16, border: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-lavender-300) 4%, transparent)' }}>
        {([
          ['contactFrequency', msg('연락 빈도'), frequency, setFrequency, FREQUENCY],
          ['initiativeLevel', msg('연락 주도성'), initiative, setInitiative, INITIATIVE],
        ] as const).map(([name, label, value, set, steps]) => (
          <div key={name}>
            <p className="t-body" style={{ fontWeight: 'var(--weight-medium)', marginBottom: 4 }}>{t(label)}</p>
            <StepSlider name={name} label={t(label)} value={value} onChange={set} steps={steps.map(o => ({ value: String(o.value), label: t(o.label) }))} />
          </div>
        ))}
        <LabeledField label={t('연락할 때 표시할 이름')} hint={t('캐릭터가 연락할 때 보이는 발신자 이름이에요. 비워 두면 캐릭터 이름을 사용해요.')}><CountedInput name="senderLabel" max={30} defaultValue={i.senderLabel} ariaLabel={t('연락할 때 표시할 이름')} /></LabeledField>
      </div>
    </div>
  </div>
}
