import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { characters, db } from '@miro/db'
import { fillCharacterMacros } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { getCharacterByKey } from '@/lib/characters'
import { officialIntro } from '@/lib/editorial/official-copy'
import { introMessages, introScenes } from '@/lib/intro-dialogue'
import { explicitText, VEILED_LINE } from '@/lib/explicit-text'
import { isUnveilPhoto, veilSrc } from '@/lib/unveil-photo'
import { coverTitle } from '@/lib/editorial/cover-title'
import { heroineName } from '@/lib/editorial/heroine-name'
import { getT } from '@/lib/i18n/server'
import { Back } from '@/components/ui'
import { ChatTheme } from '@/components/chat-theme'
import styles from '../../[sessionId]/chat.module.css'
import { MessageList, type Msg } from '../../[sessionId]/messages'
import { TurnsProvider } from '../../[sessionId]/turns'
import { GuestComposer } from './guest-composer'

export async function generateMetadata(): Promise<Metadata> { const t = await getT(); return { title: t('대화'), robots: { index: false } } }

/**
 * 게스트 대화창(11/27 사용자) — 로그인 전에도 대화방이 인트로까지 열린다. 말을 보내려는 순간(보내기·추천 답변 카드) 로그인 시트가 뜨고,
 * 로그인·온보딩 뒤 이 주소로 돌아오면 방을 만들어 적어 둔 말을 바로 보낸다(guest-composer). 방·기록은 로그인한 뒤에만 생긴다.
 */
export default async function GuestChat({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ scene?: string | string[] }> }) {
  const [t, { slug }, query, user] = await Promise.all([getT(), params, searchParams, currentUser()])
  const c = await getCharacterByKey(slug, user?.id ?? null)
  if (!c) notFound()
  // 성인 전용 작품은 상세의 본인인증 흐름으로.
  if (c.adultOnly) redirect(`/character/${slug}`)
  const [extra] = await db.select({ secret: characters.secret, firstReplies: characters.firstReplies, playGuide: characters.playGuide, ensemblePhotos: characters.ensemblePhotos })
    .from(characters).where(eq(characters.id, c.id)).limit(1)
  const dialogue = officialIntro(c, c.sampleDialogue)
  const scene = typeof query.scene === 'string' && introScenes(dialogue).includes(query.scene) ? query.scene : undefined
  // 게스트는 언베일을 켤 수 없다 — 노골적인 글은 가림 문구로, 언베일 사진은 자리표시로(상세와 같은 규칙).
  const fill = (text: string) => fillCharacterMacros(text, c.name, undefined)
  const opening = introMessages('guest', dialogue, undefined, { scene })
  const items: Msg[] = opening.map((m, i) => {
    const veiled = m.kind === 'text' && explicitText(m.content)
    return { id: `guest:${i}`, role: m.role, kind: m.kind, opening: true, blocks: veiled ? [] : m.blocks,
      content: veiled ? t(VEILED_LINE) : m.kind === 'text' ? fill(m.content) : veilSrc(m.content, false) }
  })
  if (!items.length && c.startingContext) items.push({ id: 'guest:opening', role: 'narrator', kind: 'text', opening: true, blocks: [],
    content: explicitText(c.startingContext) ? t(VEILED_LINE) : fill(c.startingContext) })
  const veilPhotos = !!c.coverUnveil || opening.some(m => (m.kind === 'text' && explicitText(m.content)) || (m.kind === 'photo' && isUnveilPhoto(m.content)))
  const named = extra?.ensemblePhotos ?? {}
  const heroine = heroineName(extra?.secret ?? null, c.personality)
  const cast = Object.keys(named).length ? Object.keys(named) : heroine && heroine !== c.name ? [heroine] : []
  const portrait = c.coverUnveil ? null : c.images.find(src => !isUnveilPhoto(src)) ?? null
  const asSuggestion = (line: string) => ({ act: [...line.matchAll(/\*([^*]+)\*/g)].map(m => m[1]!.trim()).join(' '), say: line.replace(/\*[^*]+\*/g, '').trim().replace(/^"|"$/g, '') })

  return (
    <TurnsProvider><ChatTheme><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href={`/character/${slug}`} />
          <div className={styles.headerIdentity}><div className={styles.headerTitleRow}><h1 className={styles.title}>{coverTitle({ slug: c.slug, name: c.name })}</h1></div></div>
        </header>
        <div className={styles.transcript}>
          <MessageList afterIntro={extra?.playGuide ? <aside className={styles.playGuide} aria-label={t('플레이 가이드')}><strong>{t('플레이 가이드')}</strong><p>{extra.playGuide}</p></aside> : undefined}
            sessionId={`guest:${slug}`} items={items} characterName={c.name} portrait={portrait} veilPhotos={veilPhotos} cast={cast} castPhotos={heroine && portrait && !Object.keys(named).length ? { [heroine]: portrait } : named} />
        </div>
        <GuestComposer slug={slug} scene={scene} signedIn={!!user} firstReplies={(extra?.firstReplies ?? []).map(fill).map(asSuggestion)} />
      </section>
    </main></ChatTheme></TurnsProvider>
  )
}
