'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/client'
import { endingOf, type PlayGame } from '@/lib/play/games'
import s from './play.module.css'

type Line = { who: 'her' | 'me' | 'scene'; text: string }

export function PlayGameView({ game }: { game: PlayGame }) {
  const t = useT()
  const [started, setStarted] = useState(false)
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [log, setLog] = useState<Line[]>([])
  const [typing, setTyping] = useState(false)
  const [copied, setCopied] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const done = started && round >= game.rounds.length && !typing
  const shown = Math.max(0, Math.min(100, score))

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [log, typing, done])

  const ask = (i: number) => {
    const r = game.rounds[i]
    if (!r) return
    setLog(l => [...l, ...(r.scene ? [{ who: 'scene' as const, text: r.scene }] : []), { who: 'her', text: r.line }])
  }
  const start = () => { setStarted(true); setRound(0); setScore(0); setLog([{ who: 'scene', text: game.intro }]); ask(0) }
  const pick = (i: number) => {
    const c = game.rounds[round]?.choices[i]
    if (!c) return
    setLog(l => [...l, { who: 'me', text: c.text }])
    setScore(v => v + c.score)
    setTyping(true)
    // ponytail: setTimeout 두 번 — 타이핑 느낌만, 언마운트 정리 없음(짧고 상태만 바꿈)
    setTimeout(() => {
      setLog(l => [...l, { who: 'her', text: c.reply }])
      const next = round + 1
      setRound(next)
      if (next < game.rounds.length) setTimeout(() => { ask(next); setTyping(false) }, 700)
      else setTyping(false)
    }, 700)
  }
  const share = async () => {
    const url = `${location.origin}/play/${game.key}?utm_source=play&utm_campaign=${game.key}`
    const ending = endingOf(game, score)
    const text = `${game.title} — ${t('호감도')} ${shown}% · ${ending.title}`
    if (navigator.share) { await navigator.share({ title: game.title, text, url }).catch(() => {}); return }
    await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {})
    setCopied(true)
  }

  if (!started) return (
    <main className={s.page}>
      <div className={s.hero}><img src={game.hero} alt="" /></div>
      <section className={s.start}>
        <p className={s.kicker}>MIRO MINI GAME</p>
        <h1>{game.title}</h1>
        <p className={s.intro}>{game.intro}</p>
        <button type="button" className={s.primary} onClick={start}>{t('시작하기')}</button>
      </section>
    </main>
  )

  const ending = endingOf(game, score)
  return (
    <main className={s.page}>
      <header className={s.bar}>
        <img src={game.avatar} alt="" />
        <b>{game.name}</b>
        <span className={s.meter} aria-label={`${t('호감도')} ${shown}%`}><i style={{ width: `${shown}%` }} /></span>
        <em>💗 {shown}%</em>
      </header>
      <div className={s.log}>
        {log.map((l, i) => <p key={i} className={s[l.who]}>{l.text}</p>)}
        {typing && <p className={`${s.her} ${s.dots}`}><span /><span /><span /></p>}
        {done && (
          <section className={s.result}>
            <img src={ending.image} alt="" />
            <div>
              <p className={s.kicker}>{t('호감도')} {shown}%</p>
              <h2>{ending.title}</h2>
              <p>{ending.text}</p>
              <Link className={s.primary} href={`/character/${game.characterSlug}?utm_source=play&utm_campaign=${game.key}`}>{t('이 다음 이야기, 미로에서 이어서')}</Link>
              <div className={s.row}>
                <button type="button" onClick={share}>{copied ? t('링크를 복사했어요') : t('결과 공유하기')}</button>
                <button type="button" onClick={start}>{t('다시 하기')}</button>
              </div>
            </div>
          </section>
        )}
        <div ref={end} />
      </div>
      {!done && !typing && round < game.rounds.length && (
        <nav className={s.choices}>
          {game.rounds[round]?.choices.map((c, i) => <button key={i} type="button" onClick={() => pick(i)}>{c.text}</button>)}
        </nav>
      )}
    </main>
  )
}
