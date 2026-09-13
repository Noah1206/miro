'use client'
import { useActionState } from 'react'
import { Accordion, Button, Field, Input, Radio, TextArea } from '@/components/ui'
import { BUILD_PRESETS, BUILD_TYPES } from '@miro/domain'
import { saveSection, type EditState } from './actions'

type CharacterFields = { name: string; age: number | null; nationality: string | null; occupation: string | null; mbti: string | null; personality: string; values: string | null; speechStyle: string | null; jealousy: number; initiative: number; emotionalExpression: number }
type WorldFields = { era: string; location: string; genre: string; worldSetting: string }
type AppearanceFields = { eyes: string; nose: string; jaw: string; skin: string; distinctive: string; hairColor: string; hairLength: string; hairStyle: string; build: string; height: string; detail: string; expression: string }
type ContactFields = { contactFrequency: number; replyDelayMinutes: number; callProbability: number; videoCallProbability: number; photoProbability: number; voiceMessageProbability: number; activeHoursStart: string; activeHoursEnd: string; initiativeLevel: number }

export function EditSections({ characterId, character, appearance, world, contact }: { characterId: string; character: CharacterFields; appearance: AppearanceFields; world: WorldFields | null; contact: ContactFields | null }) {
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
      <Section characterId={characterId} name="appearance" title="외형">
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
          사진 · Live Scene · 영상통화가 모두 이 외형으로 그려집니다. 바꾸면 다음 이미지부터 반영됩니다.
        </p>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 6 }}>체형</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {BUILD_TYPES.map((b) => (
              <Radio key={b} name="build" value={b} label={BUILD_PRESETS[b].label} defaultChecked={appearance.build === b} />
            ))}
          </div>
        </fieldset>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="키"><Input name="height" defaultValue={appearance.height} placeholder="184cm" /></Field>
          <Field label="체형 설명"><Input name="detail" defaultValue={appearance.detail} placeholder="어깨가 넓다" /></Field>
        </div>
        <Field label="눈"><Input name="eyes" defaultValue={appearance.eyes} placeholder="또렷한 검은 눈" /></Field>
        <Field label="코"><Input name="nose" defaultValue={appearance.nose} placeholder="반듯한 콧날" /></Field>
        <Field label="턱"><Input name="jaw" defaultValue={appearance.jaw} placeholder="각진 턱선" /></Field>
        <Field label="피부"><Input name="skin" defaultValue={appearance.skin} placeholder="깨끗한 피부" /></Field>
        <Field label="알아보게 하는 특징" hint="흉터, 점, 문신처럼 한 가지">
          <Input name="distinctive" defaultValue={appearance.distinctive} placeholder="왼쪽 눈가의 작은 점" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="머리 색"><Input name="hairColor" defaultValue={appearance.hairColor} placeholder="검은색" /></Field>
          <Field label="머리 길이"><Input name="hairLength" defaultValue={appearance.hairLength} placeholder="짧은" /></Field>
        </div>
        <Field label="머리 스타일"><Input name="hairStyle" defaultValue={appearance.hairStyle} placeholder="자연스럽게 넘긴" /></Field>
        <Field label="평소 표정"><Input name="expression" defaultValue={appearance.expression} placeholder="표정 변화가 크지 않다" /></Field>
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
