'use client'
import { useEffect } from 'react'
import { motion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { spring } from '@/lib/motion/tokens'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

/** 일상·연락 탭은 관계 탭에 합쳤고, 외형도 관계 탭으로 옮기고 그 자리에 명령어 탭을 뒀다(10/19). */
export type CreateTab = 'profile' | 'personality' | 'commands' | 'lore' | 'relationship' | 'intro' | 'status' | 'endings' | 'situations' | 'voice' | 'settings' | 'advanced' | 'preview'

/**
 * 11/21 사용자(베이비챗식 깊이): 탭 6개 — 필수 칸이 있는 프로필·시작이 앞. 상태창은 '설정'(lore) 탭에,
 * 명령어·먼저 연락하기·엔딩은 '고급' 탭에 함께 펼친다. 칸·저장값은 그대로, 묶음과 이름만 바꿨다.
 */
export const TABS: Array<{ key: CreateTab; label: string }> = [
  { key: 'profile', label: msg('프로필') },
  { key: 'intro', label: msg('시작') },
  { key: 'lore', label: msg('설정') },
  { key: 'situations', label: msg('사진·음악') },
  { key: 'settings', label: msg('등록') },
  { key: 'advanced', label: msg('고급') },
  { key: 'preview', label: msg('미리보기') },
]

/**
 * 만들기 머리 (레퍼런스 구조): 닫기 · 제목 · 등록, 그 아래 가로 스크롤 탭.
 * 탭에는 표시를 달지 않는다 — 필수는 칸의 별표가 말하고, 다 차기 전엔 등록이 잠겨 있다.
 */
export function CreateHeader({ tab, onTab, experienceType, canSubmit, canDraft, pending, buttons, closeHref, missingHint, onBlocked, hidden = [] }: {
  tab: CreateTab
  /** 11/20 화면에서 뺀 탭(세계관)과 고급 설정을 켜야 보이는 탭(엔딩). 패널은 DOM 에 남아 값을 보낸다. */
  hidden?: CreateTab[]
  onTab: (t: CreateTab) => void
  experienceType: 'chat' | 'reality'
  missingHint?: string
  canSubmit: boolean
  canDraft: boolean
  pending: boolean
  /** create: 등록. save: 이미 등록한 캐릭터를 고칠 때 — 저장 하나. */
  buttons: 'create' | 'save'
  closeHref: string
  /** 11/20 게시가 잠겼을 때 누르면 — 무엇이 빠졌는지 알린다(안내 글은 10/20 요청으로 화면에서 숨겨 둔 채). */
  onBlocked?: () => void
}) {
  const t = useT()
  // 4개 넘게 있는 탭은 밀어서 본다 — '다음'으로 넘어간 탭이 화면 밖이면 보이는 자리로 끌어온다.
  useEffect(() => { document.querySelector(`.create-tabs [aria-controls="panel-${tab}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [tab])
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--gutter))',
      background: 'var(--color-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 var(--gutter)' }}>
        <TransitionLink href={closeHref} direction="back" aria-label={t('닫기')}
          style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, color: 'var(--color-text-primary)' }}>
          <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </TransitionLink>
        {/* 10/20: 보이는 제목은 지운다(사용자 요청) — 읽어 주는 기기만 듣는다. */}
        <h1 className="sr-only">{experienceType === 'chat' ? t('캐릭터챗') : t('미로 캐릭터')}</h1>
        {/* 10/20: '아직 필요' 안내도 화면에서 지운다(사용자 요청) — 읽어 주는 기기에만 알리고, 자리는 버튼을 오른쪽으로 미는 빈칸. */}
        <span className="sr-only" aria-live="polite">{missingHint}</span>
        <span style={{ flex: 1 }} />
        {buttons === 'create' && <button type="submit" name="intent" value="draft" disabled={!canDraft || pending}
          style={{ minHeight: 44, padding: '4px 6px', background: 'none', border: 0, color: canDraft && !pending ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)', cursor: canDraft && !pending ? 'pointer' : 'default', fontSize: 'var(--font-caption)' }}>{t('임시저장')}</button>}
        <button type={canSubmit ? 'submit' : 'button'} name="intent" value="publish" disabled={pending || (!canSubmit && !onBlocked)} aria-disabled={!canSubmit}
          onClick={canSubmit ? undefined : onBlocked} className="hit" style={chip(true, canSubmit && !pending)}>
          {buttons === 'save' ? (pending ? t('저장 중') : t('저장')) : (pending ? t('게시 중') : t('게시'))}
        </button>
      </div>

      {/* 탭 사이 간격을 고르게 벌려 양쪽 여백이 같다. 첫·끝 탭의 글자가 페이지 여백선에 맞도록 탭 안쪽 여백(6px)만큼 뺀다. */}
      {/* 입력 탭은 고르게 펼치고, 미리보기도 배경 없는 밑줄 탭으로 구분한다. */}
      <div role="tablist" className="create-tabs" aria-label={t('만들기 항목')} style={{ display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 var(--gutter) 0 calc(var(--gutter) - 6px)', containerType: 'inline-size' }}>
        {/* 11/21 사용자: 처음 보이는 건 탭 4개까지, 나머지는 가로로 밀어서 — 탭 하나 = 탭 줄 폭의 1/4. */}
        <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'flex-start', gap: 0 }}>
          {/* 11/21 사용자: 미리보기도 같은 가로 스크롤 탭으로(그 전엔 줄 끝의 작은 눈 아이콘 버튼). 데스크톱은 오른쪽에 늘 보여 탭을 숨긴다(create-preview-tab). */}
          {TABS.filter((x) => !hidden.includes(x.key)).map((x) => {
            const active = x.key === tab
            return (
              <button key={x.key} type="button" role="tab" className={x.key === 'preview' ? 'create-preview-tab' : undefined} aria-selected={active} aria-controls={`panel-${x.key}`} onClick={() => onTab(x.key)}
                style={{
                  position: 'relative', flex: '0 0 25cqi', padding: '12px 6px', background: 'transparent', border: 0, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  fontSize: 'var(--tab-font, var(--font-body-size))', fontWeight: active ? 'var(--tab-weight, var(--weight-medium))' : 'var(--tab-weight, var(--weight-regular))',
                  color: active ? 'var(--color-text-primary)' : 'var(--tab-inactive, var(--color-text-secondary))',
                }}>
                {t(x.label)}
                {active && <motion.span layoutId="create-tab-underline" transition={spring.default}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'var(--color-accent)' }} />}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}

function chip(primary: boolean, on: boolean): React.CSSProperties {
  return {
    minHeight: 32, padding: '4px 10px', borderRadius: 'var(--radius-button)', border: 0, cursor: on ? 'pointer' : 'default',
    fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)',
    background: primary && on ? 'var(--color-accent)' : 'var(--color-surface-2)',
    color: primary && on ? 'var(--color-accent-on)' : on ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
  }
}

/**
 * 11/10 단계 이동(크랙 만들기식) — 폼 맨 아래에 붙는 이전/다음. 다음 버튼엔 다음 탭 이름을 써서 어디로 가는지 보이게.
 * 마지막 입력 탭에선 다음이 없다(게시는 머리의 버튼). 탭을 바꾸면 폼 맨 위로 올린다.
 */
export function StepNav({ tab, onTab, hidden = [] }: { tab: CreateTab; onTab: (t: CreateTab) => void; hidden?: CreateTab[] }) {
  const t = useT()
  const keys = TABS.filter(x => x.key !== 'preview' && !hidden.includes(x.key))
  const at = keys.findIndex(x => x.key === tab)
  if (at < 0) return null
  const go = (k: CreateTab) => { onTab(k); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const prev = keys[at - 1], next = keys[at + 1]
  return (
    <nav aria-label={t('단계 이동')} className="create-stepnav">
      {prev ? <button type="button" className="create-step-prev" onClick={() => go(prev.key)}>{t('이전')}</button> : <span />}
      <span className="create-step-count" aria-hidden>{at + 1} / {keys.length}</span>
      {next ? <button type="button" className="create-step-next" onClick={() => go(next.key)}>{t('다음')} · {t(next.label)}</button> : <span />}
    </nav>
  )
}
