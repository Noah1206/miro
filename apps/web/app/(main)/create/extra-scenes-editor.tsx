'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont, DialogueEditor } from './form-parts'

type Turn = Parameters<typeof DialogueEditor>[0]['defaultValue'] extends (infer U)[] | undefined ? U : never
type Row = { id: number; scene: string; lines: Turn[] }
export const EXTRA_SCENE_LIMIT = 4

/**
 * 시작 설정 추가(11/10, 크랙 시작 설정 여러 개) — 첫 장면 말고 다른 시작 상황. 장면 이름과 그 장면의 인트로를 쓴다.
 * 사용자는 캐릭터 소개 페이지에서 시작할 장면을 고른다(이미 있는 기능, 10/5). 전에는 편집기가 첫 장면만 다뤄서 시드로만 넣을 수 있었다.
 * 칸 순서대로 extraScene(이름)·extraSceneDialogue(인트로 JSON)를 같은 개수로 싣는다.
 */
export function ExtraScenesEditor({ defaultValue, characterName }: { defaultValue: Array<{ scene: string; lines: Turn[] }>; characterName: string }) {
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
          <div style={{ height: 360 }}>
            <DialogueEditor intro fill name="extraSceneDialogue" characterName={characterName} defaultValue={r.lines} />
          </div>
        </div>
      ))}
      {rows.length < EXTRA_SCENE_LIMIT && <button type="button" onClick={() => { setRows(rs => [...rs, { id: nextId, scene: '', lines: [] }]); setNextId(n => n + 1) }}
        style={{ minHeight: 44, borderRadius: 12, border: '1.5px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: fieldFont }}>{t('+ 시작 설정 추가')} ({rows.length}/{EXTRA_SCENE_LIMIT})</button>}
    </div>
  )
}
