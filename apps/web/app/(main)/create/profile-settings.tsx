'use client'

import { useRef, useState } from 'react'
import {
  EVENT_RULES, GROWABLE, MOODS, REACH_OUT_RULES, SEMANTIC_EVENT_TYPES, WELCOME_EVENTS,
  type Mood, type ProfileItem, type ReachOutRule, type ReactionLevel, type RelationshipProfile, type SemanticEventType,
} from '@miro/domain'
import { Button, Switch } from '@/components/ui'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import { ChoiceChips, box } from './form-parts'

/**
 * 관계 성격표 편집(domain/relationship/profile). 저장 때 AI 가 성격 설명에서 만든 표를 문장으로 보여 주고, 작성자가 고친다.
 * 문장은 값에서 만든다 — 작성자가 값을 바꾸면 문장도 같이 바뀐다. 고친 칸은 author 로 표시돼 표를 다시 만들어도 남는다.
 * 고친 적이 없으면 표를 제출하지 않는다 — 뒤에서 막 만들어진 표를 옛 화면이 덮지 않게.
 */
export type ProfileStatus = 'none' | 'stale' | 'ready'

const WHEN: Record<SemanticEventType, string> = {
  compliment: msg('칭찬을 들으면'), confession: msg('고백을 받으면'), expressed_longing: msg('보고 싶었다는 말을 들으면'), rejection: msg('밀어내면'),
  hostility: msg('차갑게 굴면'), ignored_character: msg('말을 무시하면'), mentioned_other_romantic_interest: msg('다른 사람 이야기를 꺼내면'),
  drank_with_someone: msg('다른 사람과 술을 마셨다고 하면'), shared_secret: msg('비밀을 털어놓으면'), lied: msg('거짓말한 걸 알게 되면'),
  apologized: msg('사과하면'), made_promise: msg('약속하면'), broke_promise: msg('약속을 어기면'), asked_about_character: msg('안부를 물으면'),
  gave_excuse: msg('사정을 설명하면'), deliberate_avoidance: msg('일부러 피하면'),
}
const MOMENT: Record<(typeof WELCOME_EVENTS)[number], string> = {
  compliment: msg('칭찬'), confession: msg('고백'), expressed_longing: msg('그리움 표현'), shared_secret: msg('비밀을 털어놓을 때'), apologized: msg('사과'),
  made_promise: msg('약속'), asked_about_character: msg('안부'), gave_excuse: msg('사정 설명'),
}
const LEVEL: Record<ReactionLevel, string> = { none: msg('개의치 않음'), low: msg('조금'), normal: msg('보통'), high: msg('크게'), extreme: msg('아주 크게'), averse: msg('싫어함') }
const MOOD: Record<Mood, string> = { neutral: msg('평소'), happy: msg('기쁠 때'), curious: msg('궁금할 때'), hurt: msg('서운할 때'), jealous: msg('질투할 때'), angry: msg('화났을 때'), anxious: msg('불안할 때') }
const REACH: Record<ReachOutRule, string> = {
  jealousy_spike: msg('질투가 나면 바로 연락'), jealous_follow_up: msg('질투가 가라앉지 않으면 다시 연락'), after_confession: msg('고백을 들은 뒤 연락'),
  after_conflict: msg('다툰 뒤 상태 메시지만 바꾸기'), after_scene: msg('만나고 헤어진 뒤 안부'), cold_silence: msg('멀어진 채 조용하면 먼저 말 걸기'),
}
const GROW: Record<(typeof GROWABLE)[number], string> = { trust: msg('믿음'), attachment: msg('애착'), protectiveness: msg('지키려는 마음') }
const PACE = [
  { key: 'opening', label: msg('마음을 여는 속도'), options: [['fast', msg('빨리')], ['normal', msg('보통')], ['slow', msg('천천히')]] },
  { key: 'romance', label: msg('연애 감정'), options: [['fast', msg('빨리')], ['normal', msg('보통')], ['slow', msg('천천히')], ['never', msg('생기지 않음')]] },
  { key: 'forgiveness', label: msg('화해'), options: [['quick', msg('금방 푼다')], ['normal', msg('보통')], ['slow', msg('오래 담아 둔다')]] },
] as const

const caption = { color: 'var(--color-text-secondary)', lineHeight: 1.6 } as const
const group = { background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' } as const
const mine = <T,>(value: T): ProfileItem<T> => ({ value, by: 'author' })
/** 칸 아래의 한 줄 — 무엇을 근거로 정했는지, 작성자가 고쳤는지. */
function Why({ item }: { item?: ProfileItem<unknown> }) {
  const t = useT()
  if (!item) return null
  const text = item.by === 'author' ? t('직접 고침') : item.quote ? t('근거: “{quote}”', { quote: item.quote }) : null
  return text ? <p className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{text}</p> : null
}

export function ProfileSettings({ profile: initial, status }: { profile: RelationshipProfile | null; status: ProfileStatus }) {
  const t = useT()
  const [profile, setProfile] = useState(initial)
  const [changed, setChanged] = useState(false)
  const [adding, setAdding] = useState<'reaction' | 'mood' | null>(null)
  // '기본으로' 는 누른 버튼째 사라진다 — 초점이 페이지 맨 앞으로 튀지 않게 같은 묶음의 추가 버튼으로 옮긴다.
  const addReaction = useRef<HTMLButtonElement>(null), addMood = useRef<HTMLButtonElement>(null)
  const refocus = (target: React.RefObject<HTMLButtonElement | null>) => requestAnimationFrame(() => target.current?.focus())
  const note = status === 'stale'
    ? t('성격 설명이 바뀌었어요. 저장하면 다시 정리하고, 직접 고친 항목은 그대로 둬요.')
    : t('저장하면 성격 설명을 읽고 이 캐릭터만의 반응 방식을 정리해요. 그 전에는 기본 반응으로 대화해요.')
  if (!profile) return <p className="t-caption" style={caption}>{note}</p>
  const edit = (next: Partial<RelationshipProfile>) => { setProfile({ ...profile, ...next }); setChanged(true) }
  const without = <K extends string, T>(record: Partial<Record<K, T>>, key: K) => { const out = { ...record }; delete out[key]; return out }

  const reactions = SEMANTIC_EVENT_TYPES.filter(type => profile.reactions[type])
  const moods = MOODS.filter(mood => profile.moods[mood])
  const empty = !reactions.length && !moods.length && !Object.keys(profile.grows).length && !Object.keys(profile.reachOut).length
    && !profile.opening && !profile.romance && !profile.forgiveness && !profile.turningPoint
  return <div className="stack" style={{ gap: 20 }}>
    <input type="hidden" name="relationshipProfile" value={JSON.stringify(profile)} />
    <input type="hidden" name="relationshipProfileChanged" value={changed ? 'on' : ''} />
    <p className="t-caption" style={caption}>
      {status === 'stale' ? note : empty
        ? t('성격 설명에서 기본과 다른 점을 찾지 못해 기본 반응으로 대화해요. 필요하면 직접 정해 보세요.')
        : t('성격 설명을 읽고 AI가 정리했어요. 대화 중 캐릭터는 이 표대로 반응하고 가까워져요. 고치면 그대로 따라요.')}
    </p>

    <section aria-label={t('이럴 때 이렇게 반응해요')} style={group}>
      <h3 className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>{t('이럴 때 이렇게 반응해요')}</h3>
      <div className="stack" style={{ gap: 18 }}>
        {reactions.map(type => {
          const item = profile.reactions[type]!
          const levels = (Object.keys(LEVEL) as ReactionLevel[]).filter(l => l !== 'averse' || (WELCOME_EVENTS as readonly string[]).includes(type))
          return <div key={type}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="t-body" style={{ flex: 1, minWidth: 0, fontWeight: 'var(--weight-semibold)' }}>{t(WHEN[type])}</span>
              <Button type="button" size="sm" aria-label={t('{item} 기본으로', { item: t(WHEN[type]) })} onClick={() => { edit({ reactions: without(profile.reactions, type) }); refocus(addReaction) }}>{t('기본으로')}</Button>
            </div>
            <ChoiceChips pill value={item.value} onChange={v => edit({ reactions: { ...profile.reactions, [type]: mine(v as ReactionLevel) } })}
              options={levels.map(l => ({ value: l, label: t(LEVEL[l]) }))} />
            <Why item={item} />
          </div>
        })}
        {!reactions.length && <p className="t-caption" style={caption}>{t('모든 상황에 기본대로 반응해요.')}</p>}
        {adding === 'reaction'
          ? <div><p className="t-caption" style={{ ...caption, marginBottom: 8 }}>{t('어떤 상황을 정할까요?')}</p>
            <ChoiceChips pill value="" onChange={v => { edit({ reactions: { ...profile.reactions, [v]: mine('normal') } }); setAdding(null) }}
              options={SEMANTIC_EVENT_TYPES.filter(type => !profile.reactions[type]).map(type => ({ value: type, label: t(WHEN[type]) }))} /></div>
          : <Button ref={addReaction} type="button" size="sm" onClick={() => setAdding('reaction')}>{t('상황 추가')}</Button>}
      </div>
    </section>

    <section aria-label={t('가까워지는 방식')} style={group}>
      <h3 className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>{t('가까워지는 방식')}</h3>
      <div className="stack" style={{ gap: 18 }}>
        {PACE.map(({ key, label, options }) => <div key={key}>
          <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 8 }}>{t(label)}</p>
          <ChoiceChips pill value={profile[key]?.value ?? 'normal'} onChange={v => edit({ [key]: mine(v) })}
            options={options.map(([value, text]) => ({ value, label: t(text) }))} />
          <Why item={profile[key]} />
        </div>)}
        <div>
          <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 8 }}>{t('친구로 여기게 되는 계기')}</p>
          <ChoiceChips pill value={profile.turningPoint?.value ?? ''}
            onChange={v => v ? edit({ turningPoint: mine(v as (typeof WELCOME_EVENTS)[number]) }) : edit({ turningPoint: undefined })}
            options={[{ value: '', label: t('따로 없음') }, ...WELCOME_EVENTS.map(e => ({ value: e, label: t(MOMENT[e]) }))]} />
          <Why item={profile.turningPoint} />
        </div>
        <div>
          <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 8 }}>{t('함께할수록 커지는 마음')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GROWABLE.map(dim => {
              const on = !!profile.grows[dim]
              return <button key={dim} type="button" aria-pressed={on} onClick={() => edit({ grows: on ? without(profile.grows, dim) : { ...profile.grows, [dim]: mine(true as const) } })}
                style={{ minHeight: 32, padding: '4px 12px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 'var(--font-caption)',
                  background: on ? 'var(--color-accent)' : 'var(--color-surface-2)', color: on ? 'var(--color-accent-on)' : 'var(--color-text-secondary)',
                  fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)' }}>{t(GROW[dim])}</button>
            })}
          </div>
          {GROWABLE.map(dim => <Why key={dim} item={profile.grows[dim]} />)}
        </div>
      </div>
    </section>

    <section aria-label={t('기분이 드러나는 방식')} style={group}>
      <h3 className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>{t('기분이 드러나는 방식')}</h3>
      <div className="stack" style={{ gap: 18 }}>
        {moods.map(mood => {
          const item = profile.moods[mood]!
          return <div key={mood}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="t-body" style={{ flex: 1, fontWeight: 'var(--weight-semibold)' }}>{t(MOOD[mood])}</span>
              <Button type="button" size="sm" aria-label={t('{item} 기본으로', { item: t(MOOD[mood]) })} onClick={() => { edit({ moods: without(profile.moods, mood) }); refocus(addMood) }}>{t('기본으로')}</Button>
            </div>
            <div style={{ padding: '6px 10px', ...box(false) }}>
              <textarea aria-label={t('{mood} 드러나는 방식', { mood: t(MOOD[mood]) })} value={item.value} maxLength={160} rows={2}
                onChange={e => edit({ moods: { ...profile.moods, [mood]: mine(e.target.value) } })}
                style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit' }} />
            </div>
            <Why item={item} />
          </div>
        })}
        {!moods.length && <p className="t-caption" style={caption}>{t('모든 기분을 기본 방식으로 드러내요.')}</p>}
        {adding === 'mood'
          ? <div><p className="t-caption" style={{ ...caption, marginBottom: 8 }}>{t('어떤 기분을 정할까요?')}</p>
            <ChoiceChips pill value="" onChange={v => { edit({ moods: { ...profile.moods, [v]: mine('') } }); setAdding(null) }}
              options={MOODS.filter(mood => !profile.moods[mood]).map(mood => ({ value: mood, label: t(MOOD[mood]) }))} /></div>
          : <Button ref={addMood} type="button" size="sm" onClick={() => setAdding('mood')}>{t('기분 추가')}</Button>}
      </div>
    </section>

    <section aria-label={t('먼저 연락하는 때')} style={group}>
      <h3 className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>{t('먼저 연락하는 때')}</h3>
      <div className="stack" style={{ gap: 18 }}>
        {REACH_OUT_RULES.map(rule => {
          const item = profile.reachOut[rule]
          const on = item?.value.on ?? true
          const reason = item?.value.reason ?? ''
          const fallback = EVENT_RULES.find(r => r.id === rule)?.effect.realityIntent?.reason ?? ''
          return <div key={rule}>
            <Switch name={`reachOut-${rule}`} checked={on} label={t(REACH[rule])} onChange={v => edit({ reachOut: { ...profile.reachOut, [rule]: mine({ on: v, reason }) } })} />
            {on && <div style={{ padding: '6px 10px', marginTop: 8, ...box(false) }}>
              <input aria-label={t('{rule} 이유', { rule: t(REACH[rule]) })} value={reason} maxLength={100} placeholder={fallback}
                onChange={e => edit({ reachOut: { ...profile.reachOut, [rule]: mine({ on, reason: e.target.value }) } })}
                style={{ width: '100%', background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
            </div>}
            <Why item={item} />
          </div>
        })}
      </div>
    </section>
  </div>
}
