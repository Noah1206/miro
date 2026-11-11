'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont, DialogueEditor } from './form-parts'

type Turn = Parameters<typeof DialogueEditor>[0]['defaultValue'] extends (infer U)[] | undefined ? U : never
type Meta = { context?: string; time?: string; location?: string; status?: string }
type Row = { id: number; scene: string; lines: Turn[] } & Meta
export const EXTRA_SCENE_LIMIT = 4

/**
 * 시작 설정 추가(11/10, 크랙 시작 설정 여러 개) — 첫 장면 말고 다른 시작 상황. 장면 이름과 그 장면의 인트로를 쓴다.
 * 사용자는 캐릭터 소개 페이지에서 시작할 장면을 고른다(이미 있는 기능, 10/5). 전에는 편집기가 첫 장면만 다뤄서 시드로만 넣을 수 있었다.
 * 칸 순서대로 extraScene(이름)·extraSceneDialogue(인트로 JSON)를 같은 개수로 싣는다.
 */
export function ExtraScenesEditor({ defaultValue, characterName }: { defaultValue: Array<{ scene: string; lines: Turn[] } & Meta>; characterName: string }) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((d, id) => ({ id, ...d })))
  const [nextId, setNextId] = useState(defaultValue.length)
  return (
    <div className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="extraScenesPresent" value="1" />
      {rows.map(r => (
        <div key={r.id} className="stack" style={{ gap: 10, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input name="extraScene" defaultValue={r.scene} maxLength={12} placeholder={t('시작 설정 이름 (예: 비 오는 밤)')} aria-label={t('시작 설정 이름')}
              style={{ ...box(false), flex: 1, minWidth: 0, minHeight: 44, padding: '0 12px', borderRadius: 8, fontSize: fieldFont, outline: 'none' }} />
            <button type="button" aria-label={t('시작 설정 빼기')} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))}
              style={{ width: 36, height: 36, flex: 'none', borderRadius: 18, border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
          {/* 장면 정보(시작 상황·장소·시간) — 이 장면으로 시작하면 세계가 여기서 출발한다. 전엔 편집기를 거치면 사라졌다(11/10 고침). */}
          <textarea name="extraSceneContext" defaultValue={r.context ?? ''} maxLength={600} rows={2} aria-label={t('시작 상황')}
            placeholder={t('시작 상황 (선택) — 사용자의 역할, 등장인물과의 관계, 이 장면이 시작되는 상황')}
            style={{ ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: fieldFont, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8 }}>
            <input name="extraSceneLocation" defaultValue={r.location ?? ''} maxLength={60} placeholder={t('장소 (선택)')} aria-label={t('장소')}
              style={{ ...box(false), minWidth: 0, minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: fieldFont, outline: 'none' }} />
            <input name="extraSceneTime" defaultValue={r.time ?? ''} maxLength={20} placeholder={t('시간 (선택)')} aria-label={t('시간')}
              style={{ ...box(false), minWidth: 0, minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: fieldFont, outline: 'none' }} />
          </div>
          <div style={{ height: 360 }}>
            <DialogueEditor intro fill name="extraSceneDialogue" characterName={characterName} defaultValue={r.lines} />
          </div>
          {/* 11/12 이 장면의 인트로 상태창 — 값까지 채워 적은 글이 인트로 마지막 글 아래 카드로 깔린다. */}
          <textarea name="extraSceneStatus" defaultValue={r.status ?? ''} maxLength={2000} rows={4} aria-label={t('인트로 상태창')}
            placeholder={t('인트로 상태창 (선택) — 이 장면에 보일 상태창을 값까지 채워 적어 주세요')}
            style={{ ...box(false), width: '100%', padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
        </div>
      ))}
      {rows.length < EXTRA_SCENE_LIMIT && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, scene: '', lines: [] }]); setNextId(n => n + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 시작 설정 추가')} ({rows.length}/{EXTRA_SCENE_LIMIT})</button>}
    </div>
  )
}
