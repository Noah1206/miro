'use client'
import { useActionState, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, Field, Input, MenuItem, Notice, Page, PageHeader, Popover, Stagger, StaggerItem, TextArea } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'
import { createDraft, saveDraft, type DraftState } from './actions'

const EXAMPLES = ['다른 사람한텐 싸가지 없는데 나한테만 잘해주는 30살 검사', '같은 병원에서 일하는 무뚝뚝한 외과의', '내 정체를 알고도 모른 척해주는 조직의 간부']

export default function CreatePage() {
  const [state, action, pending] = useActionState(createDraft, { draft: null, error: null, providerNotice: null } satisfies DraftState)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  return (
    <Page style={{ maxWidth: 560 }}>
      <PageHeader back="/home" title="한 사람을 만든다" lead="한 문장이면 됩니다. 만든 뒤에도 무엇이든 고칠 수 있어요." />
      {state.providerNotice && <Notice style={{ marginBottom: 16 }}>⚠ {state.providerNotice}</Notice>}

      <form action={action} className="stack" style={{ gap: 12 }}>
        <TextArea ref={ta} name="oneLiner" rows={3} required maxLength={300} placeholder="어떤 캐릭터를 원하시나요?" aria-label="캐릭터 설명" style={{ fontSize: 'var(--font-body-lg)', lineHeight: 1.6 }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExamplesOpen((o) => !o)} aria-expanded={examplesOpen}>예시 보기</Button>
          <Popover open={examplesOpen} onClose={() => setExamplesOpen(false)} anchor="left">
            {EXAMPLES.map((e) => <MenuItem key={e} type="button" onClick={() => { if (ta.current) ta.current.value = e; setExamplesOpen(false); ta.current?.focus() }}>{e}</MenuItem>)}
          </Popover>
          <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0 }}>최대 300자</span>
        </div>
        <AnimatePresence>
          {state.error && <motion.p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter}>{state.error}</motion.p>}
        </AnimatePresence>
        <Button type="submit" variant={state.draft ? 'secondary' : 'primary'} size="lg" full status={pending ? 'loading' : 'idle'}>
          {pending ? '만드는 중' : state.draft ? '다시 만들기' : '초안 만들기'}
        </Button>
      </form>

      <AnimatePresence>{state.draft && <DraftPreview draft={state.draft} />}</AnimatePresence>
    </Page>
  )
}

/** 초안은 확정이 아니다 — 이름부터 바꿀 수 있다. 등장은 위에서 아래로 짧게. */
function DraftPreview({ draft: d }: { draft: NonNullable<DraftState['draft']> }) {
  return (
    <motion.form action={saveDraft} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter} style={{ marginTop: 'var(--space-6)' }}>
      <input type="hidden" name="draft" value={JSON.stringify(d)} />
      <h2 className="t-micro" style={{ marginBottom: 12 }}>초안 미리보기</h2>
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
        <Field label="이름"><Input name="name" defaultValue={d.identity.name} maxLength={40} className="t-name" style={{ fontSize: 'var(--font-title-2)', fontWeight: 'var(--weight-bold)', fontFamily: 'var(--font-display)' }} /></Field>
        <Stagger gap={0.04} className="stack" style={{ gap: 14, marginTop: 18 }}>
          <Row label="기본" value={[d.identity.age && `${d.identity.age}세`, d.identity.nationality, d.identity.occupation, d.identity.mbti].filter(Boolean).join(' · ')} />
          <Row label="역할" value={d.presentation.role} />
          <Row label="성격" value={d.personality.personality} />
          <Row label="말투" value={d.personality.speechStyle} />
          <Row label="세계" value={`${d.world.era} · ${d.world.location} · ${d.world.genre}`} />
          <Row label="세계관" value={d.world.worldSetting} />
          <Row label="시작 장면" value={d.startingContext} quote />
          <Row label="관계" value={d.presentation.relationshipKeywords.join(' · ')} />
        </Stagger>
      </div>
      <p className="t-caption" style={{ margin: '12px 0 16px' }}>저장하면 이 사람의 세계가 시작됩니다. 관계는 처음부터 가깝지 않습니다.</p>
      <Button type="submit" variant="primary" size="lg" full>저장하고 시작하기</Button>
    </motion.form>
  )
}
function Row({ label, value, quote }: { label: string; value: string | null; quote?: boolean }) {
  if (!value) return null
  return <StaggerItem><p className="t-micro" style={{ marginBottom: 3 }}>{label}</p><p className={quote ? 't-body t-quote' : 't-body'} style={{ lineHeight: 1.7 }}>{value}</p></StaggerItem>
}
