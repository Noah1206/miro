'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/client'
import { DAILY_PULLS, RATES, type Card, type Rarity } from '@/lib/play/cards'
import s from './play.module.css'

export type ClientCard = Omit<Card, 'img'> & { img: string | null }
export type ClientSet = { key: string; slug: string; title: string; name: string; cover: string; cards: ClientCard[] }

/** 브라우저에만 저장 — 로그인 없이 바로 뽑게. ponytail: 지우면 초기화, 보상이 붙으면 서버 저장으로. */
type Save = { day: string; used: number; bonus: number; owned: Record<string, number[]> }
const KEY = 'miro_cards_v1'
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const load = (): Save => {
  const fresh = { day: today(), used: 0, bonus: 0, owned: {} }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Save | null
    return v ? (v.day === today() ? v : { ...v, day: today(), used: 0, bonus: 0 }) : fresh
  } catch { return fresh }
}
const roll = (): Rarity => {
  let r = Math.random()
  for (const k of ['UR', 'SR', 'R', 'N'] as const) { if ((r -= RATES[k]) < 0) return k }
  return 'N'
}

export function CardGame({ sets, signedIn }: { sets: ClientSet[]; signedIn: boolean }) {
  const t = useT()
  const [save, setSave] = useState<Save | null>(null)
  const [tab, setTab] = useState(0)
  const [drawn, setDrawn] = useState<{ card: ClientCard; isNew: boolean } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => setSave(load()), [])
  const write = (v: Save) => { setSave(v); try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }

  const set = sets[tab]!
  const owned = new Set(save?.owned[set.key] ?? [])
  const left = save ? DAILY_PULLS + save.bonus - save.used : 0

  const pull = () => {
    if (!save || left <= 0) return
    const rarity = roll()
    const pool = set.cards.map((c, i) => [c, i] as const).filter(([c]) => c.rarity === rarity)
    const [card, idx] = pool[Math.floor(Math.random() * pool.length)]!
    const isNew = !owned.has(idx)
    write({ ...save, used: save.used + 1, owned: { ...save.owned, [set.key]: isNew ? [...owned, idx] : [...owned] } })
    setFlipped(false); setDrawn({ card, isNew })
    setTimeout(() => setFlipped(true), 350)
  }
  const share = async () => {
    const url = `${location.origin}/play?utm_source=play_share`
    const text = `${set.title} ${t('사진 카드')} ${owned.size}/${set.cards.length}`
    const shared = navigator.share ? await navigator.share({ title: t('캐릭터 사진 카드 뽑기'), text, url }).then(() => true, () => false)
      : await navigator.clipboard.writeText(`${text}\n${url}`).then(() => { setCopied(true); return true }, () => false)
    // 공유하면 하루 한 번 +1 뽑기
    if (shared && save && save.bonus === 0) write({ ...save, bonus: 1 })
  }
  const done = owned.size === set.cards.length
  const unveilHref = signedIn ? '/home' : '/login?next=/play'

  return (
    <main className={s.page}>
      <header className={s.head}>
        <p className={s.kicker}>MIRO CARD</p>
        <h1>{t('캐릭터 사진 카드 뽑기')}</h1>
        <p className={s.sub}>{t('매일 무료 {n}번 · 공유하면 +1', { n: DAILY_PULLS })}</p>
      </header>
      <nav className={s.tabs}>
        {sets.map((x, i) => <button key={x.key} type="button" aria-pressed={i === tab} onClick={() => { setTab(i); setDrawn(null) }}>{x.title}</button>)}
      </nav>

      <section className={s.stage}>
        {drawn ? (
          <div className={`${s.flip} ${flipped ? s.on : ''}`}>
            <div className={s.back}><img src="/icon-192.png" alt="" /><b>MIRO</b></div>
            <div className={`${s.face} ${s[drawn.card.rarity]}`}>
              {drawn.card.img ? <img src={drawn.card.img} alt="" /> : <Locked cover={set.cover} href={unveilHref} t={t} />}
              <span className={s.badge}>{drawn.card.rarity}{drawn.isNew && ' · NEW'}</span>
            </div>
          </div>
        ) : (
          <div className={s.coverCard}><img src={set.cover} alt="" /><span>{set.name}</span></div>
        )}
        <button type="button" className={s.primary} disabled={!save || left <= 0} onClick={pull}>
          {save && left <= 0 ? t('오늘 뽑기를 다 썼어요') : `${t('카드 뽑기')} (${left})`}
        </button>
        <div className={s.row}>
          <button type="button" onClick={share}>{copied ? t('링크를 복사했어요') : save?.bonus ? t('결과 공유하기') : t('공유하고 +1 뽑기')}</button>
          <Link href={`/character/${set.slug}?utm_source=play&utm_campaign=${set.key}`}>{t('{name} 만나러 가기', { name: set.name })}</Link>
        </div>
        <p className={s.rates}>N 55% · R 28% · SR 12% · UR 5%</p>
      </section>

      <section className={s.book}>
        <h2>{t('도감')} <small>{owned.size}/{set.cards.length}</small></h2>
        {done && <p className={s.done}>{t('도감 완성! 이 다음 이야기는 미로에서.')}</p>}
        <ul>
          {set.cards.map((c, i) => (
            <li key={i} className={`${s[c.rarity]} ${owned.has(i) ? '' : s.missing}`}>
              {owned.has(i) ? (c.img ? <img src={c.img} alt="" /> : <Locked cover={set.cover} href={unveilHref} t={t} small />) : <span>?</span>}
              <em>{c.rarity}</em>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function Locked({ cover, href, t, small }: { cover: string; href: string; t: ReturnType<typeof useT>; small?: boolean }) {
  return (
    <Link href={href} className={s.locked}>
      <img src={cover} alt="" />
      <span>🔒{!small && <><br />{t('언베일 카드')}<br /><small>{t('성인 인증 후 언베일을 켜면 공개')}</small></>}</span>
    </Link>
  )
}
