'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button, Switch } from '@/components/ui'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import { StepSlider } from '@/app/(main)/create/settings-controls'

/**
 * 11/24 사용자: 화면 설정 — 글자 크기·글씨체·사진 크기·대화창 넓이. 보기 설정일 뿐이라 이 기기에만 저장한다(출력량·전개 설정과 같은 방식).
 * 값은 채팅방 뿌리(ChatTheme)에 data-chat-* 로 실리고, 모양은 chat.module.css·globals.css 의 규칙이 정한다.
 */
const KEY = 'miro:chat-display', EVENT = 'miro:chat-display'
const FONTS = ['small', 'normal', 'large', 'xlarge'] as const
const PHOTOS = ['off', 'small', 'medium', 'full'] as const
export type ChatDisplay = { font: typeof FONTS[number]; serif: boolean; photo: typeof PHOTOS[number]; wide: boolean }
const DEFAULT: ChatDisplay = { font: 'normal', serif: false, photo: 'full', wide: false }
const read = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
const parse = (raw: string): ChatDisplay => {
  try {
    const v = JSON.parse(raw || 'null')
    return { font: FONTS.includes(v?.font) ? v.font : 'normal', serif: v?.serif === true, photo: PHOTOS.includes(v?.photo) ? v.photo : 'full', wide: v?.wide === true }
  } catch { return DEFAULT }
}
const subscribe = (on: () => void) => { window.addEventListener(EVENT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on) } }

export function useChatDisplay(): [ChatDisplay, (v: ChatDisplay) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  const value = useMemo(() => parse(raw), [raw])
  const set = (v: ChatDisplay) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* 이번 화면에서만 */ } window.dispatchEvent(new Event(EVENT)) }
  return [value, set]
}

/** 채팅방 뿌리에 싣는 속성 — 기본값은 싣지 않는다(규칙이 걸리지 않게). */
export function chatDisplayAttrs(d: ChatDisplay) {
  return {
    'data-chat-font': d.font !== 'normal' ? d.font : undefined, 'data-chat-serif': d.serif || undefined,
    'data-chat-photo': d.photo !== 'full' ? d.photo : undefined, 'data-chat-width': d.wide ? 'wide' : undefined,
  }
}

const FONT_STEPS = [{ value: 'small', label: msg('작게') }, { value: 'normal', label: msg('기본') }, { value: 'large', label: msg('크게') }, { value: 'xlarge', label: msg('아주 크게') }]
const PHOTO_STEPS = [{ value: 'off', label: msg('숨기기') }, { value: 'small', label: msg('작게') }, { value: 'medium', label: msg('중간') }, { value: 'full', label: msg('크게') }]
const SCALE = { small: .9, normal: 1, large: 1.13, xlarge: 1.27 } as const
const SERIF = "'Noto Serif KR', 'Noto Serif CJK KR', AppleMyungjo, 'Nanum Myeongjo', Batang, serif"

/** 채팅방 설정의 '화면 설정' 화면. */
export function DisplayPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [saved, save] = useChatDisplay()
  const [pick, setPick] = useState(saved)
  useEffect(() => { setPick(saved) }, [saved])
  return (
    <div className="stack" style={{ gap: 12, padding: '4px 0 var(--space-5)' }}>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{t('대화 화면을 보기 편하게 맞춰요. 이 기기에만 저장돼요.')}</p>
      <strong style={{ fontSize: 15, fontWeight: 700 }}>{t('글자 크기')}</strong>
      <StepSlider label={t('글자 크기')} value={pick.font} onChange={v => setPick({ ...pick, font: v as ChatDisplay['font'] })} steps={FONT_STEPS.map(o => ({ value: o.value, label: t(o.label) }))} />
      {/* 고른 글자 크기·글씨체로 한 줄 미리 보기 */}
      <p style={{ margin: 0, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', lineHeight: 1.65,
        fontSize: `calc(var(--font-body-size) * ${SCALE[pick.font]})`, fontFamily: pick.serif ? SERIF : undefined }}>{t('“오늘은 조금 늦었네.” 그녀가 창가에서 돌아보며 웃었다.')}</p>
      <Switch name="serif" label={t('명조체로 보기')} hint={t('책처럼 읽고 싶을 때 좋아요. 기기에 명조체가 없으면 그대로 보여요.')} checked={pick.serif} onChange={v => setPick({ ...pick, serif: v })} />
      <strong style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{t('사진 크기')}</strong>
      <StepSlider label={t('사진 크기')} value={pick.photo} onChange={v => setPick({ ...pick, photo: v as ChatDisplay['photo'] })} steps={PHOTO_STEPS.map(o => ({ value: o.value, label: t(o.label) }))} />
      <Switch name="wide" label={t('대화창 넓게')} hint={t('컴퓨터 화면에서만 달라져요.')} checked={pick.wide} onChange={v => setPick({ ...pick, wide: v })} />
      <Button variant="primary" full onClick={() => { save(pick); onClose() }}>{t('적용')}</Button>
    </div>
  )
}
