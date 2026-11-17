import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { characters, db, memories, relationships, roleplaySessions } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { getConversationPersona } from '@/lib/persona'
import { reflectionKey } from '@/lib/memory-reflection'
import { CharacterPhoto } from '@/components/character-visual'
import { Page, PageHeader } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { MemoryGraphView } from '../memory-graph'
import { Reflection } from './reflection'
import styles from './memory.module.css'

/**
 * 11/17 대화 기억 페이지 — 캐릭터가 대화에서 정리해 둔 기억을 사람의 수첩처럼 본다.
 * 나에 대한 생각(캐릭터가 쓴 글) · 요즘 우리 · 약속 · 너에 대해 아는 것 · 함께한 일 · 지난 이야기 · 이 세계. 맨 아래 기억 관리는 예전 화면 그대로. 유저노트(사용자가 적는 설정)는 여기 없다 — 채팅방 메뉴의 제 칸.
 */
export default async function MemoryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const t = await getT()
  const [room] = await db.select({ name: characters.name, images: characters.images, persona: roleplaySessions.userPersona, turns: roleplaySessions.turnCount, stored: roleplaySessions.memoryReflection })
    .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))).limit(1)
  if (!room) notFound()
  const [rows, [rel]] = await Promise.all([
    db.select({ id: memories.id, type: memories.type, content: memories.content, pinned: memories.pinned, createdAt: memories.createdAt }).from(memories).where(eq(memories.sessionId, sessionId)).orderBy(asc(memories.createdAt)),
    db.select({ stage: relationships.stage, emotionalDistance: relationships.emotionalDistance, unresolvedEventIds: relationships.unresolvedEventIds }).from(relationships).where(eq(relationships.sessionId, sessionId)).limit(1),
  ])
  const me = (room.persona ?? await getConversationPersona(user.id, sessionId))?.name?.trim() || t('나')
  // 요약은 '사용자(지민)는' 처럼 3인칭으로 쓰여 있다 — 사람이 쓴 수첩처럼 이름으로 바꾸고 조사를 이름에 맞춘다.
  const human = (s: string) => s.replace(/사용자(?:\s*\(([^)]+)\))?(?:(은|는|이|가|을|를|와|과)(?![가-힣]))?/g,
    (_m, a: string | undefined, j: string | undefined) => { const n = a ?? me; return n + (j ? josa(n, j) : '') })
  const of = (...types: string[]) => rows.filter(r => types.includes(r.type)).reverse()
  const summary = of('short_term_summary')[0]
  const promises = of('promise'), facts = of('user_fact', 'preference'), together = of('shared_event', 'relationship_change', 'conflict'), chapters = of('chapter'), world = of('world_fact')
  const fresh = room.stored && room.stored.key === reflectionKey(rows) ? room.stored : null
  const photo = room.images?.[0]

  const List = ({ title, items, hint }: { title: string; items: typeof rows; hint?: string }) => items.length ? (
    <section className={styles.section}>
      <h2 className="t-title-3">{title}</h2>
      {hint && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
      <ul className={styles.list}>{items.map(m => <li key={m.id}>{m.pinned && <span className={styles.pin}>{t('꼭 기억')}</span>}{human(m.content)}</li>)}</ul>
    </section>
  ) : null

  return (
    <Page style={{ maxWidth: 640 }}>
      <PageHeader back={`/chat/${sessionId}`} title={t('{name}의 기억 노트', { name: room.name })} lead={t('대화하면서 {name}의 기억에 남은 것들이에요.', { name: room.name })} />
      <div className={styles.profile}>
        {photo && <span className={styles.avatar}><CharacterPhoto src={photo} alt="" size="avatar" width={56} height={56} sizes="56px" /></span>}
        <div>
          <strong className="t-name">{room.name}</strong>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
            {rel ? t(stageLabel(rel.stage, rel)) : t('낯선 사이')} · {t('함께한 대화 {n}턴', { n: room.turns })}
          </p>
        </div>
      </div>

      {rows.length === 0 ? <p className={`t-body ${styles.empty}`}>{t('아직 기억이 없어요. 조금 더 이야기를 나누면 하나씩 쌓여요.')}</p> : <>
        <Reflection sessionId={sessionId} name={room.name} initial={fresh} />
        {summary && <section className={styles.section}>
          <h2 className="t-title-3">{t('요즘 우리')}</h2>
          <div className={styles.story}>{human(summary.content).split(/\[([^\]]{1,20})\]/).map((part, i) => i % 2 ? <h3 key={i} className="t-micro">{part}</h3> : part.trim() && <p key={i} className="t-body">{part.trim()}</p>)}</div>
        </section>}
        <List title={t('약속한 것')} items={promises} />
        <List title={t('{me}에 대해 아는 것', { me })} items={facts} />
        <List title={t('함께한 일')} items={together} />
        {chapters.length > 0 && <section className={styles.section}>
          <h2 className="t-title-3">{t('지난 이야기')}</h2>
          {chapters.map((c, i) => <details key={c.id} className={styles.chapter} open={i === 0}>
            <summary className="t-caption">{t('{n}번째 이야기', { n: chapters.length - i })}</summary>
            <div className={styles.story}>{human(c.content).split(/\[([^\]]{1,20})\]/).map((part, j) => j % 2 ? <h3 key={j} className="t-micro">{part}</h3> : part.trim() && <p key={j} className="t-body">{part.trim()}</p>)}</div>
          </details>)}
        </section>}
        <List title={t('이 세계에 대해')} items={world} />
      </>}

      <details className={styles.manage}>
        <summary className="t-body">{t('기억 관리')}</summary>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('기억을 고정하거나 고치고, 지우거나 직접 적을 수 있어요.')}</p>
        <MemoryGraphView sessionId={sessionId} refreshKey={room.turns} />
      </details>
    </Page>
  )
}

/** 받침에 맞는 조사 — '지민'+'는' → '지민은', '하나'+'은' → '하나는'. 한글로 끝나지 않으면 그대로. */
function josa(word: string, j: string): string {
  const c = word.charCodeAt(word.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return j
  const has = (c - 0xac00) % 28 > 0
  const pair: Record<string, [string, string]> = { 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] }
  return pair[j] ? pair[j][has ? 0 : 1] : j
}
