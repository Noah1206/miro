'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createDraft, saveDraft, type DraftState } from './actions'

const initial: DraftState = { draft: null, error: null, providerNotice: null }

const EXAMPLES = [
  '다른 사람한텐 싸가지 없는데 나한테만 잘해주는 30살 검사',
  '같은 병원에서 일하는 무뚝뚝한 외과의',
  '내 정체를 알고도 모른 척해주는 조직의 간부',
]

export default function CreatePage() {
  const [state, action, pending] = useActionState(createDraft, initial)

  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 120px', maxWidth: 560, margin: '0 auto' }}>
      <Link href="/home" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>

      <h1 style={{ fontSize: 24, margin: '18px 0 6px' }}>캐릭터 만들기</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
        한 문장으로 설명하면 초안을 만들어 드립니다. 만든 뒤에도 수정할 수 있습니다.
      </p>

      {state.providerNotice && (
        <p role="status" style={{
          fontSize: 12, padding: '10px 12px', marginBottom: 16,
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--elevated)', color: 'var(--text-secondary)',
        }}>
          ⚠ {state.providerNotice}
        </p>
      )}

      <form action={action}>
        <textarea
          name="oneLiner" rows={3} required maxLength={300}
          placeholder="어떤 캐릭터를 원하시나요?"
          defaultValue={state.draft ? undefined : ''}
          style={{
            width: '100%', padding: 14, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--text-primary)', fontSize: 15, resize: 'vertical',
            fontFamily: 'inherit', lineHeight: 1.6,
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 16px' }}>
          {EXAMPLES.map((e) => (
            <span key={e} style={{
              fontSize: 11.5, padding: '5px 10px', borderRadius: 999,
              border: '1px solid var(--border)', color: 'var(--text-secondary)',
            }}>{e}</span>
          ))}
        </div>

        {state.error && (
          <p role="alert" style={{ color: 'var(--accent-strong)', fontSize: 13, margin: '0 0 12px' }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} style={{
          width: '100%', padding: 16, border: 'none', borderRadius: 'var(--radius)',
          background: state.draft ? 'var(--elevated)' : 'var(--accent)',
          color: 'var(--text-primary)', fontSize: 15, fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.6 : 1,
        }}>
          {pending ? '만드는 중…' : state.draft ? '다시 만들기' : '초안 만들기'}
        </button>
      </form>

      {state.draft && <DraftPreview draft={state.draft} />}
    </main>
  )
}

function DraftPreview({ draft: d }: { draft: NonNullable<DraftState['draft']> }) {
  return (
    <form action={saveDraft} style={{ marginTop: 32 }}>
      <input type="hidden" name="draft" value={JSON.stringify(d)} />

      <h2 style={{ fontSize: 12, letterSpacing: '0.14em', color: 'var(--text-secondary)',
                   margin: '0 0 12px', fontWeight: 500 }}>
        초안 미리보기
      </h2>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 20,
      }}>
        <label style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>이름</label>
        <input name="name" defaultValue={d.identity.name} maxLength={40} style={{
          width: '100%', margin: '6px 0 18px', padding: 11,
          background: 'var(--elevated)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, fontWeight: 600,
        }} />

        <Row label="기본" value={[
          d.identity.age && `${d.identity.age}세`,
          d.identity.nationality, d.identity.occupation, d.identity.mbti,
        ].filter(Boolean).join(' · ')} />
        <Row label="역할" value={d.presentation.role} />
        <Row label="성격" value={d.personality.personality} />
        <Row label="말투" value={d.personality.speechStyle} />
        <Row label="세계" value={`${d.world.era} · ${d.world.location} · ${d.world.genre}`} />
        <Row label="세계관" value={d.world.worldSetting} />
        <Row label="시작 상황" value={d.startingContext} />
        <Row label="관계 키워드" value={d.presentation.relationshipKeywords.join(', ')} />
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '12px 0 0', lineHeight: 1.6 }}>
        저장하면 이 캐릭터와 역할극이 시작됩니다. 관계는 처음부터 가깝지 않습니다.
      </p>

      <button type="submit" style={{
        width: '100%', marginTop: 16, padding: 17, border: 'none',
        borderRadius: 'var(--radius)', background: 'var(--accent)',
        color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
      }}>
        저장하고 시작하기
      </button>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>{value}</p>
    </div>
  )
}
