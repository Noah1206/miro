import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { characters, db, memories, relationships, roleplaySessions } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { getConversationPersona } from '@/lib/persona'
import { reflectionKey } from '@/lib/memory-reflection'
import { Page } from '@/components/ui'
import { NotesHeader } from './notes-header'
import { getT } from '@/lib/i18n/server'
import { Reflection } from './reflection'
import styles from './memory.module.css'

/**
 * 11/17 대화 기억 페이지 — 캐릭터가 대화에서 정리해 둔 기억을 사람의 수첩처럼 본다.
 * 나에 대한 생각(캐릭터가 쓴 글) · 단기 기억(요약) · 장기 기억(약속·아는 것·함께한 일·세계·지난 이야기). 캐릭터의 독립적인 기억이라 보기만(11/17). 유저노트는 /note.
 */
export default async function MemoryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const t = await getT()
  const [room] = await db.select({ name: characters.name, persona: roleplaySessions.userPersona, turns: roleplaySessions.turnCount, stored: roleplaySessions.memoryReflection })
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

  const List = ({ title, items }: { title: string; items: typeof rows }) => items.length ? (
    <div className={styles.card}>
      <p className={styles.small}>{title}</p>
      <ul className={styles.list}>{items.map(m => <li key={m.id}>{human(m.content)}</li>)}</ul>
    </div>
  ) : null
  const story = (text: string) => human(text).split(/\[([^\]]{1,20})\]/).map((part, i) => i % 2 ? <h4 key={i}>{part}</h4> : part.trim() && <p key={i}>{part.trim()}</p>)
  const longTerm = promises.length + facts.length + together.length + chapters.length + world.length

  return (
    <Page style={{ maxWidth: 640 }}>
      <NotesHeader sessionId={sessionId} active="memory" />
      <div className={`create-page ${styles.memoryPage}`}>
        <div className={styles.meta}>
          <span className={styles.chip}>{rel ? t(stageLabel(rel.stage, rel)) : t('낯선 사이')}</span>
          <span className={styles.chip}>{t('함께한 대화 {n}턴', { n: room.turns })}</span>
        </div>

        {rows.length === 0 ? <p className={styles.empty}>{t('아직 기억이 없어요. 조금 더 이야기를 나누면 하나씩 쌓여요.')}</p> : <>
          <Reflection sessionId={sessionId} name={room.name} initial={fresh} />
          {/* 11/17 크랙 요약 메모리처럼 단기 기억(지금 흐름)과 장기 기억(쌓인 것)을 나눈다. 캐릭터의 기억이라 보기만. */}
          {summary && <section className={styles.block}>
            <h2 className={styles.label}>{t('단기 기억')}</h2>
            <p className={styles.hint}>{t('최근 대화의 흐름이에요. 5턴마다 새로 정리돼요.')}</p>
            <div className={`${styles.card} ${styles.story}`}>{story(summary.content)}</div>
          </section>}
          {longTerm > 0 && <section className={styles.block}>
            <h2 className={styles.label}>{t('장기 기억')}</h2>
            <p className={styles.hint}>{t('대화가 쌓이며 오래 남은 기억이에요.')}</p>
            <List title={t('약속한 것')} items={promises} />
            <List title={t('{me}에 대해 아는 것', { me })} items={facts} />
            <List title={t('함께한 일')} items={together} />
            <List title={t('이 세계에 대해')} items={world} />
            {chapters.length > 0 && <div className={styles.card}>
              <p className={styles.small}>{t('지난 이야기')}</p>
              {chapters.map((c, i) => <details key={c.id} className={styles.chapter}>
                <summary>{t('{n}번째 이야기', { n: chapters.length - i })}</summary>
                <div className={styles.story}>{story(c.content)}</div>
              </details>)}
            </div>}
          </section>}
        </>}
      </div>
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
