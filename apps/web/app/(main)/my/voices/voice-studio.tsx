'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Checkbox, Input, Notice, Switch, TransitionLink } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import type { MyVoice, VoiceUploadError } from '@/lib/voice'
import { activateVoice, beginVoicePrompt, createVoice, deleteVoice, setVoiceOption, warmVoice } from './actions'

const MAX_SECONDS = 30

/**
 * 녹음 → 동의 → 만들기 → (자동) 미리 듣기 → 등록. 빠르게: 녹음을 시작할 때 GPU 를 깨우고, 올리자마자 GPU 가 미리 듣기를 만든다.
 * 등록한 목소리는 공개·언베일 사용을 바꾸거나 지울 수 있다.
 */
export function VoiceStudio({ voices, max }: { voices: MyVoice[]; max: number }) {
  const t = useT()
  const router = useRouter()
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<Blob | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const recorder = useRef<MediaRecorder | null>(null)
  const clipUrl = useClipUrl(clip)
  const [promptText, setPromptText] = useState('')
  useEffect(() => { beginVoicePrompt().then(setPromptText).catch(() => setPromptText('')) }, [])

  const errors: Record<VoiceUploadError | 'mic', string> = {
    invalid: t('이름과 필수 동의를 확인해 주세요.'),
    unreadable: t('녹음을 읽지 못했어요. 다시 녹음해 주세요.'),
    length: t('5~30초로 녹음해 주세요.'),
    quiet: t('소리가 작아요. 마이크에 가까이 대 주세요.'),
    clipped: t('소리가 깨졌어요. 조금 떨어져서 읽어 주세요.'),
    mismatch: t('문장과 다르게 들려요. 문장 그대로 다시 읽어 주세요.'),
    limit: t('음성은 {n}개까지 만들 수 있어요.', { n: max }),
    unavailable: t('지금은 만들 수 없어요. 잠시 뒤 다시 해 주세요.'),
    mic: t('마이크를 허용해 주세요.'),
  }

  async function toggleRecord() {
    if (recording) { recorder.current?.stop(); return }
    setError(null); setClip(null)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }).catch(() => null)
    if (!stream) { setError(errors.mic); return }
    void warmVoice().catch(() => {})   // 녹음하는 동안 음성 서버가 켜진다
    const rec = new MediaRecorder(stream), chunks: Blob[] = [], began = Date.now()
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000); setSeconds(s)
      if (s >= MAX_SECONDS) rec.stop()
    }, 250)
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      clearInterval(timer); stream.getTracks().forEach((x) => x.stop()); setRecording(false)
      setClip(new Blob(chunks, { type: rec.mimeType }))
    }
    recorder.current = rec; rec.start(); setSeconds(0); setRecording(true)
  }

  function submit(form: FormData) {
    if (!clip) return
    form.set('audio', new File([clip], 'voice', { type: clip.type }))
    start(async () => {
      const out = await createVoice(form)
      if ('error' in out) { setError(errors[out.error]); return }
      setClip(null); router.refresh()
    })
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      {voices.length > 0 && (
        <section className="stack" style={{ gap: 12 }} aria-label={t('내 음성')}>
          {voices.map((v) => <VoiceRow key={v.id} voice={v} />)}
        </section>
      )}

      {voices.length < max && (
        <form action={submit} className="stack" style={{ gap: 14 }}>
          <h2 className="t-title">{t('이 문장을 읽어 녹음하세요')}</h2>
          <blockquote lang="ko" style={{ margin: 0, padding: '16px 18px', borderRadius: 12, background: 'var(--color-surface-2)', fontSize: 17, lineHeight: 1.6, minHeight: 88 }}>{promptText}</blockquote>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button type="button" variant={recording ? 'destructive' : 'secondary'} onClick={toggleRecord} disabled={pending || !promptText}>
              {recording ? t('녹음 멈추기 ({n}초)', { n: seconds }) : clip ? t('다시 녹음') : t('녹음 시작')}
            </Button>
            {clipUrl && !recording && <audio src={clipUrl} controls style={{ height: 40, maxWidth: '100%' }} />}
          </div>
          <Input name="label" required maxLength={30} placeholder={t('음성 이름 (예: 낮은 목소리)')} aria-label={t('음성 이름')} />
          <div className="stack" style={{ gap: 0 }}>
            <Checkbox name="ownVoice" required label={t('(필수) 제 목소리입니다')} />
            <Checkbox name="cloneConsent" required label={<>{t('(필수) AI가 이 목소리로 대사를 읽는 데 동의합니다')} <TransitionLink href="/privacy" style={{ textDecoration: 'underline' }}>{t('개인정보 처리방침')}</TransitionLink></>} />
            <Checkbox name="shared" label={t('(선택) 다른 사용자에게 공개')} />
            <Checkbox name="adult" label={t('(선택) 언베일에서도 사용')} />
          </div>
          {error && <Notice tone="danger" role="alert">{error}</Notice>}
          <Button type="submit" variant="primary" disabled={!clip || recording || pending} status={pending ? 'loading' : undefined}>{t('만들기')}</Button>
        </form>
      )}
    </div>
  )
}

function VoiceRow({ voice }: { voice: MyVoice }) {
  const t = useT()
  const [busy, start] = useTransition()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [failed, setFailed] = useState(false)
  const url = useClipUrl(preview)

  /** 올릴 때 GPU 가 만들기 시작한 미리 듣기를 기다린다(1초마다, 최대 3분). */
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
  // 막 올린 목소리는 누르지 않아도 미리 듣기가 준비되면 바로 재생된다
  useEffect(() => { if (voice.status === 'pending') void listen() }, [voice.id])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <article className="stack" style={{ gap: 6, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{voice.label}</strong>
        <span className="t-caption" style={{ color: voice.status === 'active' ? 'var(--color-lavender-200)' : 'var(--color-text-tertiary)' }}>
          {voice.status === 'active' ? t('등록됨') : t('등록 전')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="button" size="sm" variant="secondary" onClick={listen} disabled={loading} status={loading ? 'loading' : undefined}>{t('미리 듣기')}</Button>
        {voice.status === 'pending' && <Button type="button" size="sm" variant="primary" disabled={!preview || busy} onClick={() => start(() => activateVoice(voice.id))}>{t('등록')}</Button>}
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

function useClipUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob); setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}
