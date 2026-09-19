'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * 실시간 음성 레이어 (Gemini Live).
 *
 * 마이크 PCM16 16kHz 를 WebSocket 으로 올리고, 24kHz PCM 응답을 이어서 재생한다.
 * 토큰에 모델·프롬프트·보이스가 잠겨 있으므로 여기서는 소리만 나른다.
 * 어떤 실패든 조용히 물러난다 — 아래 텍스트 통화 UI 가 그대로 남아 있다 (명세서 5.2 예외).
 */
export function LiveAudio({ token, url, model }: { token: string; url: string; model: string }) {
  const [status, setStatus] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting')
  const [detail, setDetail] = useState<string | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => {
    let closed = false
    const ws = new WebSocket(`${url}?access_token=${encodeURIComponent(token)}`)
    let micStream: MediaStream | null = null
    let inCtx: AudioContext | null = null
    let proc: ScriptProcessorNode | null = null
    let outCtx: AudioContext | null = null
    let playCursor = 0

    const stop = () => {
      if (closed) return
      closed = true
      try { proc?.disconnect() } catch { /* already gone */ }
      micStream?.getTracks().forEach((t) => t.stop())
      void inCtx?.close().catch(() => {})
      void outCtx?.close().catch(() => {})
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }
    cleanup.current = stop

    const fail = (message: string) => { setStatus('error'); setDetail(message); stop() }

    const startMic = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        })
      } catch {
        fail('마이크를 사용할 수 없어요. 아래 입력으로 계속할 수 있어요.')
        return
      }
      inCtx = new AudioContext({ sampleRate: 16000 })
      const source = inCtx.createMediaStreamSource(micStream)
      proc = inCtx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const f32 = e.inputBuffer.getChannelData(0)
        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i]! * 32767)))
        ws.send(JSON.stringify({
          realtimeInput: { audio: { data: toBase64(new Uint8Array(i16.buffer)), mimeType: 'audio/pcm;rate=16000' } },
        }))
      }
      source.connect(proc)
      // ScriptProcessor 는 출력에 연결돼야 콜백이 돈다. 무음 게인으로 스피커 유출을 막는다.
      const mute = inCtx.createGain()
      mute.gain.value = 0
      proc.connect(mute)
      mute.connect(inCtx.destination)
    }

    const play = (b64: string) => {
      if (!outCtx) outCtx = new AudioContext({ sampleRate: 24000 })
      const bytes = fromBase64(b64)
      const i16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2))
      if (i16.length === 0) return
      const buffer = outCtx.createBuffer(1, i16.length, 24000)
      const ch = buffer.getChannelData(0)
      for (let i = 0; i < i16.length; i++) ch[i] = i16[i]! / 32768
      const src = outCtx.createBufferSource()
      src.buffer = buffer
      src.connect(outCtx.destination)
      const at = Math.max(playCursor, outCtx.currentTime + 0.02)
      src.start(at)
      playCursor = at + buffer.duration
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ setup: { model } }))
      void startMic()
    }
    ws.onmessage = async (event) => {
      const text = typeof event.data === 'string' ? event.data : await (event.data as Blob).text()
      let msg: {
        setupComplete?: unknown
        serverContent?: { interrupted?: boolean; modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> } }
      }
      try { msg = JSON.parse(text) } catch { return }
      if (msg.setupComplete) setStatus('live')
      if (msg.serverContent?.interrupted) playCursor = 0 // 사용자가 말을 끊었다 — 예약된 재생을 앞당겨 비운다.
      for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) play(part.inlineData.data)
      }
    }
    ws.onerror = () => { if (!closed) fail('실시간 연결이 불안정해요. 아래 입력으로 계속할 수 있어요.') }
    ws.onclose = () => {
      if (closed) return
      setStatus((s) => (s === 'error' ? s : 'ended'))
      setDetail((d) => d ?? '실시간 연결이 끝났어요. 아래 입력으로 계속할 수 있어요.')
      stop()
    }

    return stop
  }, [token, url, model])

  return (
    <p role="status" className="t-caption" style={{ textAlign: 'center', marginTop: 10, color: 'var(--color-text-tertiary)' }}>
      {status === 'connecting' && '목소리를 연결하는 중…'}
      {status === 'live' && '통화 중 — 편하게 말하세요'}
      {(status === 'ended' || status === 'error') && (detail ?? '실시간 연결이 끝났어요.')}
    </p>
  )
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
