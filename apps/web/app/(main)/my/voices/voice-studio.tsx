'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Notice, Switch, TransitionLink } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import type { MyVoice, VoiceUploadError } from '@/lib/voice'
import { avatar } from '../../create/voice-list'
import flowCss from '../../create/voice-list.module.css'
import css from './voice-studio.module.css'
import { activateVoice, createVoice, deleteVoice, newVoicePrompt, setVoiceOption, warmVoice } from './actions'

const MAX_SECONDS = 30
const BARS = 36
type Prompt = { text: string; token: string }

/**
 * 내 음성 만들기(10/31, 사용자와 HTML 로 맞춘 3단계).
 *  1 녹음 — 문장 하나를 크게(문장·따옴표 단위 줄바꿈), 큰 녹음 버튼, 실시간 파형·타이머, 실제로 들린 말을 라벤더 자막으로(브라우저 받아쓰기, 타이핑).
 *    끝나면 방금 녹음 듣기 + 다시 하기 / 다음.
 *  2 사진·이름·동의 — 목소리 고르기 목록에 쓰일 동그라미 사진, 이름, 토스식 동의.
 *  3 미리 듣기·등록 — 만드는 동안 라벤더 구슬, 준비되면 견본 문장이 흐르며 재생, 등록.
 * 자막의 받아쓰기는 브라우저 기능이라 크롬은 구글, 사파리는 애플 서버로 음성이 간다(처리방침에 적음). 실제 거절 판단은 Modal 받아쓰기가 한다.
 */
export function VoiceStudio({ voices, max, prompt: first }: { voices: MyVoice[]; max: number; prompt: Prompt }) {
  const t = useT()
  return (
    <div className="stack" style={{ gap: 32 }}>
      {voices.length > 0 && (
        <section className="stack" style={{ gap: 12 }} aria-label={t('내 음성')}>
          {voices.map((v) => <VoiceRow key={v.id} voice={v} />)}
        </section>
      )}
      {voices.length < max
        ? <Studio first={first} />
        : <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('음성은 {n}개까지 만들 수 있어요.', { n: max })}</p>}
    </div>
  )
}

/** 줄바꿈: 글자가 끝까지 차서가 아니라 문장이 끝나거나(. ? ! …) 따옴표가 열릴 때. 닫는 따옴표 뒤는 띄어쓰기가 있을 때만("괜찮아"라고 는 한 줄). */
export const promptLines = (p: string) => p.replace(/([.?!…])\s+/g, '$1\n').replace(/\s+(["“‘'])/g, '\n$1').replace(/(["”’'])\s+/g, '$1\n')
  .split('\n').map((x) => x.trim()).filter(Boolean)

const CHECK = <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
const PLAY = <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden><path d="M9.5 7.5v9l7-4.5z" stroke="currentColor" strokeWidth="3.6" strokeLinejoin="round" /></svg>
const PAUSE = <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden><rect x="6.5" y="6" width="4" height="12" rx="2" /><rect x="13.5" y="6" width="4" height="12" rx="2" /></svg>

function Studio({ first }: { first: Prompt }) {
  const t = useT()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [prompt, setPrompt] = useState(first)
  const [live, setLive] = useState(false)
  const [clip, setClip] = useState<Blob | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const recorder = useRef<MediaRecorder | null>(null)
  const caption = useTyping()
  const recognizer = useRef<{ stop(): void } | null>(null)
  // 2단계
  const [name, setName] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const imageUrl = useBlobUrl(image)
  const [agree, setAgree] = useState({ own: false, clone: false, shared: false, adult: false })
  const all = Object.values(agree).every(Boolean)
  // 3단계
  const [made, setMade] = useState<string | null>(null)

  const errors: Record<VoiceUploadError | 'mic', string> = {
    invalid: t('이름과 필수 동의를 확인해 주세요.'),
    unreadable: t('녹음을 읽지 못했어요. 다시 녹음해 주세요.'),
    length: t('5~30초로 녹음해 주세요.'),
    quiet: t('소리가 작아요. 마이크에 가까이 대 주세요.'),
    clipped: t('소리가 깨졌어요. 조금 떨어져서 읽어 주세요.'),
    mismatch: t('문장과 다르게 들려요. 문장 그대로 다시 읽어 주세요.'),
    limit: t('음성을 더 만들 수 없어요.'),
    unavailable: t('지금은 만들 수 없어요. 잠시 뒤 다시 해 주세요.'),
    image: t('사진을 올리지 못했어요. 5MB 이하 사진으로 다시 골라 주세요.'),
    mic: t('마이크를 허용해 주세요.'),
  }

  async function toggleRecord() {
    if (live) { recorder.current?.stop(); return }
    setError(null); setClip(null); caption.reset()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }).catch(() => null)
    if (!stream) { setError(errors.mic); return }
    void warmVoice().catch(() => {})   // 녹음하는 동안 음성 서버가 켜진다
    // 파형 — 마이크 소리 크기를 막대로
    const ctx = new AudioContext(), analyser = ctx.createAnalyser(); analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let frame = 0
    const draw = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 4)
      setLevels((l) => [...l.slice(1), level])
      frame = requestAnimationFrame(draw)
    }
    draw()
    recognizer.current = startRecognition(caption.typeTo)
    const rec = new MediaRecorder(stream), chunks: Blob[] = [], began = Date.now()
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000); setSeconds(s)
      if (s >= MAX_SECONDS) rec.stop()
    }, 250)
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      clearInterval(timer); cancelAnimationFrame(frame); void ctx.close(); stream.getTracks().forEach((x) => x.stop())
      recognizer.current?.stop(); recognizer.current = null
      setLive(false); setLevels(Array(BARS).fill(0))
      setClip(new Blob(chunks, { type: rec.mimeType }))
    }
    recorder.current = rec; rec.start(); setSeconds(0); setLive(true)
  }

  function retake() { setClip(null); setSeconds(0); caption.reset(); setError(null) }
  async function swap() { setPrompt(await newVoicePrompt()); retake() }

  function make() {
    if (!clip) return
    const form = new FormData()
    form.set('audio', new File([clip], 'voice', { type: clip.type }))
    form.set('promptToken', prompt.token)
    form.set('label', name)
    if (image) form.set('image', image)
    if (agree.own) form.set('ownVoice', 'on')
    if (agree.clone) form.set('cloneConsent', 'on')
    if (agree.shared) form.set('shared', 'on')
    if (agree.adult) form.set('adult', 'on')
    setError(null)
    start(async () => {
      const out = await createVoice(form)
      if ('error' in out) {
        setError(errors[out.error])
        // 녹음 문제면 1단계로 돌려보낸다
        if (['unreadable', 'length', 'quiet', 'clipped', 'mismatch'].includes(out.error)) { retake(); setStep(1) }
        return
      }
      setMade(out.id); setStep(3)
    })
  }

  return (
    <section aria-label={t('새 음성 만들기')}>
      <div className={css.steps} aria-hidden>{[1, 2, 3].map((n) => <i key={n} className={n <= step ? css.on : undefined} />)}</div>

      {step === 1 && (
        <div key="s1" className={css.appear}>
          <div className={css.top}>
            <p className={css.eyebrow}>{t('아래 문장을 평소 말투로 읽어 주세요')}</p>
            <button type="button" className={css.swap} onClick={swap} disabled={live}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" /></svg>{t('다른 문장')}
            </button>
          </div>
          <p key={prompt.token} lang="ko" className={`${css.phrase} ${css.appear} ${live ? css.recording : ''}`}>
            {promptLines(prompt.text).map((l, i) => <span key={i}>{l}</span>)}
          </p>
          <p className={`${css.caption} ${live ? css.typing : ''}`} aria-live="polite">{caption.text}</p>
          {!clip ? (
            <div key="stage" className={`${css.stage} ${css.appear} ${live ? css.live : ''}`}>
              <div className={css.wave} aria-hidden>{levels.map((l, i) => <b key={i} style={{ height: 6 + l * 34 }} />)}</div>
              <div className={css.timer}>{`0:${String(seconds).padStart(2, '0')} / 0:${MAX_SECONDS}`}</div>
              <button type="button" className={css.recbtn} onClick={toggleRecord} aria-label={live ? t('녹음 끝내기') : t('녹음 시작')}><span /></button>
              <p className={css.hint}>{live ? t('다 읽었으면 눌러서 끝내기') : t('눌러서 녹음 시작')}</p>
            </div>
          ) : (
            <div key="done" className={css.appear} style={{ paddingTop: 28 }}>
              <Take clip={clip} seconds={seconds} />
              <div className={css.row}>
                <button type="button" className={`${css.btn} ${css.ghost}`} onClick={retake}>{t('다시 하기')}</button>
                <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => { setError(null); setStep(2) }}>{t('다음')}</button>
              </div>
            </div>
          )}
          {error && <Notice tone="danger" role="alert" style={{ marginTop: 16 }}>{error}</Notice>}
        </div>
      )}

      {step === 2 && (
        <div key="s2" className={css.appear}>
          <div className={css.ident}>
            <label className={css.pic} aria-label={t('프로필 사진')}
              style={{ background: imageUrl ? `center / cover url(${imageUrl})` : avatar(name || 'voice') }}>
              {!imageUrl && (name.trim().slice(0, 1) || '♪')}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
              <span className={css.cam}><svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
            </label>
            <input className={css.field} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('이름')} aria-label={t('이름')} maxLength={30} />
          </div>
          <div className={css.consent}>
            <label className={css.all}>
              <input type="checkbox" checked={all} onChange={(e) => setAgree({ own: e.target.checked, clone: e.target.checked, shared: e.target.checked, adult: e.target.checked })} />
              <span className={css.dot}>{CHECK}</span>{t('모두 동의')}
            </label>
            <div className={css.items}>
              {([['own', true, t('제 목소리입니다')], ['clone', true, t('AI가 이 목소리로 대사를 읽어요')], ['shared', false, t('다른 사용자에게 공개')], ['adult', false, t('언베일에서도 사용')]] as const)
                .map(([k, required, label]) => (
                  <label key={k}>
                    <input type="checkbox" checked={agree[k]} onChange={(e) => setAgree((a) => ({ ...a, [k]: e.target.checked }))} />
                    <span className={css.tick}>{CHECK}</span>
                    <span><span className={`${css.tag} ${required ? css.req : ''}`}>{required ? t('[필수]') : t('[선택]')}</span>{label}</span>
                    {k === 'clone' && <TransitionLink href="/privacy" className={css.more} aria-label={t('개인정보 처리방침')}>›</TransitionLink>}
                  </label>
                ))}
            </div>
          </div>
          {error && <Notice tone="danger" role="alert" style={{ marginBottom: 16 }}>{error}</Notice>}
          <div className={css.row}>
            <button type="button" className={`${css.btn} ${css.primary}`} onClick={make} disabled={pending || !name.trim() || !agree.own || !agree.clone}>
              {pending ? t('만드는 중…') : t('만들기')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && made && (
        <Finish key={made} id={made} name={name} imageUrl={imageUrl}
          onDone={() => { router.refresh(); setStep(1); setMade(null); setName(''); setImage(null); setAgree({ own: false, clone: false, shared: false, adult: false }); retake(); void swap() }} />
      )}
    </section>
  )
}

/** 방금 녹음 듣기 — 흰 재생 버튼 + 파형 모양 + 길이. */
function Take({ clip, seconds }: { clip: Blob; seconds: number }) {
  const t = useT()
  const url = useBlobUrl(clip)
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  return (
    <div className={css.take}>
      <button type="button" className={css.play} aria-label={playing ? t('멈추기') : t('들어 보기')}
        onClick={() => { const el = audio.current; if (!el) return; if (playing) { el.pause(); setPlaying(false) } else { void el.play(); setPlaying(true) } }}>
        {playing ? PAUSE : PLAY}
      </button>
      <div aria-hidden style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 28 }}>
        {Array.from({ length: 40 }, (_, i) => <b key={i} style={{ flex: 1, borderRadius: 1, background: '#4a4a4a', height: 6 + Math.abs(Math.sin(i * 1.7)) * 22 }} />)}
      </div>
      <span className={css.timer}>{`0:${String(seconds).padStart(2, '0')}`}</span>
      {url && <audio ref={audio} src={url} onEnded={() => setPlaying(false)} />}
    </div>
  )
}

/** 3단계 — 미리 듣기가 준비될 때까지 구슬, 준비되면 견본 문장이 라벤더로 흐르며 재생, 등록. */
function Finish({ id, name, imageUrl, onDone }: { id: string; name: string; imageUrl: string | null; onDone: () => void }) {
  const t = useT()
  const audio = useRef<HTMLAudioElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, start] = useTransition()
  useEffect(() => {
    let alive = true
    void (async () => {
      for (let i = 0; i < 180 && alive; i++) {
        const res = await fetch(`/api/voices/${id}/preview`).catch(() => null)
        if (res?.status === 202) { await new Promise((r) => setTimeout(r, 1000)); continue }
        if (!alive) return
        if (!res?.ok) break
        const url = URL.createObjectURL(await res.blob())
        setSrc(url)
        return
      }
      if (alive) setFailed(true)
    })()
    return () => { alive = false }
  }, [id])
  useEffect(() => { if (src && audio.current) { void audio.current.play().then(() => setPlaying(true)).catch(() => {}) } }, [src])
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  return (
    <div className={css.appear}>
      <div className={css.center}>
        <div className={css.orb} style={imageUrl ? { background: `center / cover url(${imageUrl})` } : undefined} />
        <h2 style={{ margin: '10px 0 0', fontSize: 22 }}>{name}</h2>
        {done ? <p className={css.hint}>{t('등록됐어요. 캐릭터 만들기에서 고를 수 있어요.')}</p>
          : failed ? <p className={css.hint} role="alert" style={{ color: 'var(--color-danger)' }}>{t('미리 듣기를 만들지 못했어요. 잠시 뒤 다시 해 주세요.')}</p>
          : !src ? <p className={css.hint}>{t('내 목소리를 만드는 중…')}</p>
          : <button type="button" onClick={() => { const el = audio.current; if (!el) return; if (playing) { el.pause(); setPlaying(false) } else { void el.play(); setPlaying(true) } }}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)' }}
              aria-label={playing ? t('멈추기') : t('미리 듣기')}>
              <span className={playing ? flowCss.flow : undefined}>{t('"안녕, 오늘 하루는 어땠어?"')}</span>
            </button>}
      </div>
      {src && <audio ref={audio} src={src} onEnded={() => setPlaying(false)} />}
      <div className={css.row}>
        {done
          ? <button type="button" className={`${css.btn} ${css.primary}`} onClick={onDone}>{t('새 음성 만들기')}</button>
          : <button type="button" className={`${css.btn} ${css.primary}`} disabled={!src || busy}
              onClick={() => start(async () => { if (await activateVoice(id)) setDone(true); else setFailed(true) })}>{t('등록')}</button>}
      </div>
    </div>
  )
}

/** 자막 타이핑 — 받아쓴 글(target)을 한 글자씩 따라 쓴다. 받아쓰기가 앞부분을 고치면 같은 데까지 지우고 다시 쓴다. */
function useTyping() {
  const [text, setText] = useState('')
  const shown = useRef(''), target = useRef(''), timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  return {
    text,
    typeTo(next: string) {
      target.current = next
      if (timer.current) return
      timer.current = setInterval(() => {
        const s = shown.current, g = target.current
        let i = 0; while (i < s.length && s[i] === g[i]) i++
        shown.current = i < s.length ? s.slice(0, i) : g.slice(0, s.length + 1)
        setText(shown.current)
        if (shown.current === g && timer.current) { clearInterval(timer.current); timer.current = null }
      }, 45)
    },
    reset() { if (timer.current) clearInterval(timer.current); timer.current = null; shown.current = target.current = ''; setText('') },
  }
}

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null }
/** 브라우저 받아쓰기(크롬·사파리). 없거나 막히면 자막 없이 녹음만 된다. */
function startRecognition(onText: (s: string) => void): { stop(): void } | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!SR) return null
  try {
    const r = new SR(); r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true
    r.onresult = (e) => { let all = ''; for (const res of Array.from(e.results)) all += res[0]?.transcript ?? ''; onText(all) }
    r.onerror = () => {}
    r.start()
    return { stop: () => { try { r.stop() } catch { /* 이미 멈춤 */ } } }
  } catch { return null }
}

function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob); setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** 이미 만든 음성 — 사진·이름, 미리 듣기, 공개·언베일 스위치, 지우기. 등록 전(중간에 나간 것)은 여기서 등록. */
function VoiceRow({ voice }: { voice: MyVoice }) {
  const t = useT()
  const [busy, start] = useTransition()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [failed, setFailed] = useState(false)
  const url = useBlobUrl(preview)

  async function listen() {
    setLoading(true); setFailed(false)
    for (let i = 0; i < 180; i++) {
      const res = await fetch(`/api/voices/${voice.id}/preview`).catch(() => null)
      if (res?.status === 202) { await new Promise((r) => setTimeout(r, 1000)); continue }
      setLoading(false)
      if (res?.ok) setPreview(await res.blob()); else setFailed(true)
      return
    }
    setLoading(false); setFailed(true)
  }

  return (
    <article className="stack" style={{ gap: 8, padding: '14px 16px', borderRadius: 14, background: 'var(--color-surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, color: '#fff',
          background: voice.imageUrl ? `center / cover url(${voice.imageUrl})` : avatar(voice.id) }}>{voice.imageUrl ? null : voice.label.slice(0, 1)}</span>
        <span className="stack" style={{ gap: 0, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: '#7a7a7a' }}>{voice.status === 'active' ? t('등록됨') : t('등록 전')}</span>
          <strong style={{ fontSize: 16 }}>{voice.label}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="button" size="sm" variant="secondary" onClick={listen} disabled={loading} status={loading ? 'loading' : undefined}>{t('미리 듣기')}</Button>
        {voice.status === 'pending' && <Button type="button" size="sm" variant="primary" disabled={!preview || busy} onClick={() => start(async () => { await activateVoice(voice.id) })}>{t('등록')}</Button>}
        <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => start(() => deleteVoice(voice.id))}>{t('지우기')}</Button>
      </div>
      {failed && <Notice tone="danger" role="alert">{t('미리 듣기 실패. 다시 눌러 주세요.')}</Notice>}
      {url && <audio src={url} controls autoPlay style={{ height: 40, maxWidth: '100%' }} />}
      <Switch name={`shared-${voice.id}`} label={t('공개')} checked={voice.shared} disabled={busy}
        onChange={(v) => start(() => setVoiceOption(voice.id, { shared: v }))} />
      <Switch name={`adult-${voice.id}`} label={t('언베일에서도 사용')} checked={voice.adultAllowed} disabled={busy}
        onChange={(v) => start(() => setVoiceOption(voice.id, { adultAllowed: v }))} />
    </article>
  )
}
