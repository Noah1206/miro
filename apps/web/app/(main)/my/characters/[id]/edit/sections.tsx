'use client'

import { useActionState } from 'react'
import { saveSection, type EditState } from './actions'

const initial: EditState = { saved: null, error: null }

type CharacterFields = {
  name: string; age: number | null; nationality: string | null
  occupation: string | null; mbti: string | null
  personality: string; values: string | null; speechStyle: string | null
  jealousy: number; initiative: number; emotionalExpression: number
}
type WorldFields = { era: string; location: string; genre: string; worldSetting: string }
type ContactFields = {
  contactFrequency: number; replyDelayMinutes: number
  callProbability: number; videoCallProbability: number
  photoProbability: number; voiceMessageProbability: number
  activeHoursStart: string; activeHoursEnd: string; initiativeLevel: number
}

type Props = {
  characterId: string
  character: CharacterFields
  world: WorldFields | null
  contact: ContactFields | null
}

export function EditSections({ characterId, character, world, contact }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section characterId={characterId} name="identity" title="기본 정보">
        <Field label="이름" name="name" value={character.name} />
        <Field label="나이" name="age" value={character.age} type="number" />
        <Field label="국적" name="nationality" value={character.nationality} />
        <Field label="직업" name="occupation" value={character.occupation} />
        <Field label="MBTI" name="mbti" value={character.mbti} />
      </Section>

      <Section characterId={characterId} name="personality" title="성격">
        <Field label="성격" name="personality" value={character.personality} multiline />
        <Field label="가치관" name="values" value={character.values} multiline />
        <Field label="말투" name="speechStyle" value={character.speechStyle} multiline />
        <Slider label="질투 성향" name="jealousy" value={character.jealousy} />
        <Slider label="주도성" name="initiative" value={character.initiative} />
        <Slider label="감정 표현" name="emotionalExpression" value={character.emotionalExpression} />
      </Section>

      {world && (
        <Section characterId={characterId} name="world" title="세계">
          <Field label="시대" name="era" value={world.era} />
          <Field label="장소" name="location" value={world.location} />
          <Field label="장르" name="genre" value={world.genre} />
          <Field label="세계관" name="worldSetting" value={world.worldSetting} multiline />
        </Section>
      )}

      {contact && (
        <Section characterId={characterId} name="contact" title="연락 성향">
          <Slider label="연락 빈도" name="contactFrequency" value={contact.contactFrequency} />
          <Slider label="주도성" name="initiativeLevel" value={contact.initiativeLevel} />
          <Slider label="전화 확률" name="callProbability" value={contact.callProbability} />
          <Slider label="영상통화 확률" name="videoCallProbability" value={contact.videoCallProbability} />
          <Slider label="사진 전송 확률" name="photoProbability" value={contact.photoProbability} />
          <Slider label="음성 메시지 확률" name="voiceMessageProbability" value={contact.voiceMessageProbability} />
          <Field label="답장 지연(분)" name="replyDelayMinutes" value={contact.replyDelayMinutes} type="number" />
          <Field label="활동 시작" name="activeHoursStart" value={contact.activeHoursStart} />
          <Field label="활동 종료" name="activeHoursEnd" value={contact.activeHoursEnd} />
        </Section>
      )}
    </div>
  )
}

function Section({ characterId, name, title, children }: {
  characterId: string; name: string; title: string; children: React.ReactNode
}) {
  const [state, action, pending] = useActionState(saveSection, initial)
  const justSaved = state.saved === name

  return (
    <form action={action} style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <input type="hidden" name="characterId" value={characterId} />
      <input type="hidden" name="section" value={name} />

      <h2 style={{ fontSize: 14, margin: '0 0 16px', fontWeight: 600 }}>{title}</h2>
      {children}

      {state.error && (
        <p role="alert" style={{ color: 'var(--accent-strong)', fontSize: 12.5, margin: '10px 0 0' }}>
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} style={{
        marginTop: 14, padding: '10px 18px', borderRadius: 9,
        border: '1px solid var(--border)',
        background: justSaved ? 'var(--elevated)' : 'transparent',
        color: justSaved ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 13, cursor: pending ? 'wait' : 'pointer',
      }}>
        {pending ? '저장 중…' : justSaved ? '저장됨' : '저장'}
      </button>
    </form>
  )
}

function Field({ label, name, value, type = 'text', multiline = false }: {
  label: string; name: string; value: string | number | null
  type?: string; multiline?: boolean
}) {
  const style: React.CSSProperties = {
    width: '100%', padding: 11, marginTop: 5,
    background: 'var(--elevated)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: 14,
    fontFamily: 'inherit', lineHeight: 1.6,
  }
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</span>
      {multiline
        ? <textarea name={name} defaultValue={value ?? ''} rows={3} style={{ ...style, resize: 'vertical' }} />
        : <input name={name} type={type} defaultValue={value ?? ''} style={style} />}
    </label>
  )
}

function Slider({ label, name, value }: { label: string; name: string; value: string | number | null }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</span>
      <input name={name} type="range" min={0} max={100} defaultValue={String(value ?? 50)}
        style={{ width: '100%', marginTop: 6, accentColor: 'var(--accent)' }} />
    </label>
  )
}
