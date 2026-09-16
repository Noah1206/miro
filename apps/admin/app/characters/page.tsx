import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can } from '@miro/domain'
import { currentAdmin } from '@/lib/auth'
import { listCharactersForAdmin, type ExperienceType } from '@/lib/characters'
import { TypePanel } from './panel'

const TABS = ['all', 'reality', 'chat'] as const

/**
 * 미로 캐릭터 지정. 홈(chat)과 미로(reality)는 캐릭터 유형으로 갈리고, 지정은 여기서만 한다.
 * 기존 캐릭터는 전부 chat 으로 시작한다 — 공식 캐릭터라고 자동으로 미로에 들어가지 않는다.
 */
export default async function Characters({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'characters.manage')) redirect('/login')
  const { type = 'all' } = await searchParams
  const rows = await listCharactersForAdmin(type as ExperienceType | 'all')

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => <Link key={t} href={`/characters?type=${t}`} className="tag" style={{ borderColor: t === type ? 'var(--accent)' : undefined }}>{t === 'all' ? '전체' : t === 'reality' ? '미로' : '홈'}</Link>)}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>
        미로에 넣은 캐릭터만 선연락·사진·통화가 열립니다. 홈으로 되돌리면 그 캐릭터의 남은 연락 의도와 대기 Push 가 함께 정리됩니다.
      </p>
      <table><thead><tr><th>이름</th><th>제작</th><th>공개</th><th>유형</th><th>대화</th><th>대기 의도</th><th>처리</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} data-character-row data-character-type={r.experienceType} data-character-id={r.id}>
            <td>{r.name}<div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.slug ?? r.id}</div></td>
            <td>{r.isOfficial ? '공식' : (r.ownerEmail ?? '-')}</td>
            <td>{r.isDraft ? '초안' : r.isPublic ? '공개' : '비공개'}</td>
            <td><span className="tag">{r.experienceType === 'reality' ? '미로' : '홈'}</span></td>
            <td>{r.sessions}</td>
            <td>{r.pendingIntents}</td>
            <td><TypePanel characterId={r.id} current={r.experienceType} sessions={r.sessions} /></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>캐릭터가 없습니다.</td></tr>}
      </tbody></table>
    </>
  )
}
