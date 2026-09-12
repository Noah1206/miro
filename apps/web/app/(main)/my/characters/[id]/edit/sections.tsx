'use client'
import { useActionState } from 'react'
import { Accordion, Button, Field, Input, TextArea } from '@/components/ui'
import { saveSection, type EditState } from './actions'

type CharacterFields = { name: string; age: number | null; nationality: string | null; occupation: string | null; mbti: string | null; personality: string; values: string | null; speechStyle: string | null; jealousy: number; initiative: number; emotionalExpression: number }
type WorldFields = { era: string; location: string; genre: string; worldSetting: string }
type ContactFields = { contactFrequency: number; replyDelayMinutes: number; callProbability: number; videoCallProbability: number; photoProbability: number; voiceMessageProbability: number; activeHoursStart: string; activeHoursEnd: string; initiativeLevel: number }

export function EditSections({ characterId, character, world, contact }: { characterId: string; character: CharacterFields; world: WorldFields | null; contact: ContactFields | null }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <Section characterId={characterId} name="identity" title="기본 정보">
        <Field label="이름"><Input name="name" defaultValue={character.name} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="나이"><Input name="age" type="number" defaultValue={character.age ?? ''} /></Field>
          <Field label="MBTI"><Input name="mbti" defaultValue={character.mbti ?? ''} /></Field>
        </div>
        <Field label="국적"><Input name="nationality" defaultValue={character.nationality ?? ''} /></Field>
        <Field label="직업"><Input name="occupation" defaultValue={character.occupation ?? ''} /></Field>
      </Section>
      <Section characterId={characterId} name="personality" title="성격">
        <Field label="성격"><TextArea name="personality" defaultValue={character.personality} rows={3} /></Field>
        <Field label="가치관"><TextArea name="values" defaultValue={character.values ?? ''} rows={2} /></Field>
        <Field label="말투"><TextArea name="speechStyle" defaultValue={character.speechStyle ?? ''} rows={2} /></Field>
        <Slider label="질투" name="jealousy" value={character.jealousy} lo="무던함" hi="예민함" />
        <Slider label="주도성" name="initiative" value={character.initiative} lo="기다림" hi="먼저 다가감" />
        <Slider label="감정 표현" name="emotionalExpression" value={character.emotionalExpression} lo="숨김" hi="드러냄" />
      </Section>
      {world && (
        <Section characterId={characterId} name="world" title="세계">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="시대"><Input name="era" defaultValue={world.era} /></Field>
            <Field label="장르"><Input name="genre" defaultValue={world.genre} /></Field>
          </div>
          <Field label="장소"><Input name="location" defaultValue={world.location} /></Field>
          <Field label="세계관"><TextArea name="worldSetting" defaultValue={world.worldSetting} rows={3} /></Field>
        </Section>
      )}
      {contact && (
        <Section characterId={characterId} name="contact" title="연락 성향">
          <Slider label="연락 빈도" name="contactFrequency" value={contact.contactFrequency} lo="드물게" hi="자주" />
          <Slider label="주도성" name="initiativeLevel" value={contact.initiativeLevel} lo="기다림" hi="먼저" />
          <Slider label="전화" name="callProbability" value={contact.callProbability} lo="거의 안 함" hi="자주" />
          <Slider label="영상통화" name="videoCallProbability" value={contact.videoCallProbability} lo="거의 안 함" hi="자주" />
          <Slider label="사진" name="photoProbability" value={contact.photoProbability} lo="거의 안 함" hi="자주" />
          <Slider label="음성 메시지" name="voiceMessageProbability" value={contact.voiceMessageProbability} lo="거의 안 함" hi="자주" />
          <Field label="답장까지 걸리는 시간(분)"><Input name="replyDelayMinutes" type="number" defaultValue={contact.replyDelayMinutes} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="활동 시작"><Input name="activeHoursStart" type="time" defaultValue={contact.activeHoursStart} /></Field>
            <Field label="활동 종료"><Input name="activeHoursEnd" type="time" defaultValue={contact.activeHoursEnd} /></Field>
          </div>
        </Section>
      )}
    </div>
  )
}

/** 섹션마다 따로 저장. 폼이 아코디언을 감싸 필드가 항상 제출에 포함된다. 기본은 열림 — 접는 건 사용자의 선택. */
function Section({ characterId, name, title, children }: { characterId: string; name: string; title: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(saveSection, { saved: null, error: null } satisfies EditState)
  const saved = state.saved === name
  return (
    <form action={action}>
      <input type="hidden" name="characterId" value={characterId} /><input type="hidden" name="section" value={name} />
      <Accordion title={title} defaultOpen right={saved && <span className="t-micro" style={{ color: 'var(--color-success)' }}>저장됨</span>}>
        <div className="stack" style={{ gap: 14 }}>
          {children}
          {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{state.error}</p>}
          <div><Button type="submit" size="sm" variant={saved ? 'secondary' : 'primary'} status={pending ? 'loading' : saved ? 'success' : 'idle'}>{pending ? '저장 중' : saved ? '저장됨' : '저장'}</Button></div>
        </div>
      </Accordion>
    </form>
  )
}
function Slider({ label, name, value, lo, hi }: { label: string; name: string; value: number; lo: string; hi: string }) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span className="t-caption">{label}</span>
      <input name={name} type="range" min={0} max={100} defaultValue={String(value)} style={{ width: '100%', accentColor: 'var(--color-white)' }} />
      <span style={{ display: 'flex', justifyContent: 'space-between' }} className="t-micro"><span>{lo}</span><span>{hi}</span></span>
    </label>
  )
}
