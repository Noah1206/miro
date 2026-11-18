'use client'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { useTurns } from './turns'
import { pickBgm } from './bgm-actions'
import styles from './chat.module.css'

const VOLUME = 0.28, FADE = 1.5

/**
 * 11/19 상황별 BGM — 새 답이 올 때마다 지금 맞는 곡을 골라(bgm-actions) 반복 재생하고, 곡이 바뀌면 서로 겹쳐 넘긴다.
 * 소리 크기는 Web Audio 로 잡는다(iOS 는 <audio>.volume 을 바꿀 수 없다). 처음 손짓 전엔 브라우저가 막아서 첫 터치 때 시작한다. 끄기는 이 기기에 기억.
 */
export function ChatBgm({ sessionId }: { sessionId: string }) {
  const t = useT()
  const { appended } = useTurns()
  const [on, setOn] = useState(true)
  const [url, setUrl] = useState<string | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const playing = useRef<{ url: string; el: HTMLAudioElement; gain: GainNode } | null>(null)
  const key = 'miro:bgm-off'
  useEffect(() => { try { setOn(localStorage.getItem(key) !== '1') } catch { /* 켜 둔다 */ } }, [])

  // 들어올 때 한 번, 그 뒤 캐릭터 답이 올 때마다 고른다.
  const lastReply = appended.filter(m => m.role === 'character' && m.kind === 'text' && /^[0-9a-f-]{36}$/i.test(m.id)).at(-1)?.id ?? ''
  const current = useRef<string | null>(null); current.current = url
  useEffect(() => {
    let live = true
    void pickBgm(sessionId, current.current).then(u => { if (live) setUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [sessionId, lastReply])

  useEffect(() => {
    const fadeOut = (p: NonNullable<typeof playing.current>) => {
      const c = ctx.current!; p.gain.gain.cancelScheduledValues(c.currentTime); p.gain.gain.setValueAtTime(p.gain.gain.value, c.currentTime); p.gain.gain.linearRampToValueAtTime(0, c.currentTime + FADE)
      setTimeout(() => { p.el.pause(); p.el.src = ''; p.gain.disconnect() }, FADE * 1000 + 100)
    }
    const want = on ? url : null
    if (playing.current?.url === want) return
    if (playing.current) { fadeOut(playing.current); playing.current = null }
    if (!want) return
    const c = (ctx.current ??= new AudioContext())
    const el = new Audio(want); el.loop = true; el.crossOrigin = 'anonymous'
    const gain = c.createGain(); gain.gain.setValueAtTime(0, c.currentTime); gain.gain.linearRampToValueAtTime(VOLUME, c.currentTime + FADE)
    c.createMediaElementSource(el).connect(gain).connect(c.destination)
    playing.current = { url: want, el, gain }
    const start = () => { void c.resume().catch(() => {}); void el.play().catch(() => {}) }
    start()
    // 손짓 전이라 막혔으면 첫 터치·키 입력 때 다시.
    const retry = () => { if (playing.current?.el === el) start() }
    document.addEventListener('pointerdown', retry, { once: true }); document.addEventListener('keydown', retry, { once: true })
    return () => { document.removeEventListener('pointerdown', retry); document.removeEventListener('keydown', retry) }
  }, [url, on])
  useEffect(() => () => { playing.current?.el.pause(); void ctx.current?.close().catch(() => {}) }, [])

  if (!url && !playing.current) return null
  const toggle = () => { const next = !on; setOn(next); try { localStorage.setItem(key, next ? '0' : '1') } catch { /* 이번만 */ } }
  return (
    <button type="button" className={styles.toolButton} onClick={toggle} aria-pressed={on} aria-label={on ? t('배경음악 끄기') : t('배경음악 켜기')}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />{!on && <path d="M3 3l18 18" />}
      </svg>
    </button>
  )
}
