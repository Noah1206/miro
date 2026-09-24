'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * 실시간 음성 레이어 (Gemini Live).
 *
 * 마이크를 기기 기본 샘플레이트로 받아 PCM16 16kHz 로 줄여 WebSocket 으로 올리고, 24kHz PCM 응답을 이어서 재생한다.
 * 토큰에 모델·프롬프트·보이스가 잠겨 있으므로 여기서는 소리만 나른다.
 * 어떤 실패든 조용히 물러난다 — 아래 텍스트 통화 UI 가 그대로 남아 있다 (명세서 5.2 예외).
 */
export function LiveAudio({ token, url, model }: { token: string; url: string; model: string }) {
  const [status, setStatus] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting')
  const [detail, setDetail] = useState<string | null>(null)
  // iOS Safari 는 탭 밖에서 만든 AudioContext 를 멈춘 채로 둔다 — 그때만 '소리 켜기'를 보여 탭으로 깨운다.
  const [muted, setMuted] = useState(false)
  const contexts = useRef<AudioContext[]>([])
  // 토큰은 1회용이다. 화면이 다시 그려지며 새 토큰이 와도 이미 연 통화는 다시 잇지 않는다.
  const first = useRef({ token, url, model })

  useEffect(() => {
    const { token, url, model } = first.current
    let closed = false
    const ws = new WebSocket(`${url}?access_token=${encodeURIComponent(token)}`)
    let micStream: MediaStream | null = null
    let proc: ScriptProcessorNode | null = null
    const inCtx = new AudioContext()
    const outCtx = new AudioContext()
    contexts.current = [inCtx, outCtx]
    const playing = new Set<AudioBufferSourceNode>()
    let playCursor = 0

    const checkMuted = () => setMuted(inCtx.state === 'suspended' || outCtx.state === 'suspended')
    void Promise.all([inCtx.resume(), outCtx.resume()]).catch(() => {}).finally(checkMuted)

    const stop = () => {
      if (closed) return
      closed = true
      try { proc?.disconnect() } catch { /* already gone */ }
      micStream?.getTracks().forEach((t) => t.stop())
      void inCtx.close().catch(() => {})
      void outCtx.close().catch(() => {})
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }

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
      if (closed) { micStream.getTracks().forEach((t) => t.stop()); return }
      const source = inCtx.createMediaStreamSource(micStream)
      proc = inCtx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const pcm = toPcm16(e.inputBuffer.getChannelData(0), inCtx.sampleRate)
        ws.send(JSON.stringify({
          realtimeInput: { audio: { data: toBase64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } },
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
      const bytes = fromBase64(b64)
      const i16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2))
      if (i16.length === 0) return
      // 24kHz 버퍼는 어느 샘플레이트의 컨텍스트에서도 브라우저가 맞춰 재생한다.
      const buffer = outCtx.createBuffer(1, i16.length, 24000)
      const ch = buffer.getChannelData(0)
      for (let i = 0; i < i16.length; i++) ch[i] = i16[i]! / 32768
      const src = outCtx.createBufferSource()
      src.buffer = buffer
      src.connect(outCtx.destination)
      src.onended = () => playing.delete(src)
      const at = Math.max(playCursor, outCtx.currentTime + 0.02)
      src.start(at)
      playing.add(src)
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
      if (msg.serverContent?.interrupted) {
        // 사용자가 말을 끊었다 — 이미 예약된 캐릭터의 말도 바로 멈춘다.
        for (const src of playing) { try { src.stop() } catch { /* already ended */ } }
        playing.clear()
        playCursor = 0
      }
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
  }, [])

  const unmute = () => {
    void Promise.all(contexts.current.map((c) => c.resume())).catch(() => {})
      .finally(() => setMuted(contexts.current.some((c) => c.state === 'suspended')))
  }

  return (
    <div style={{ textAlign: 'center', marginTop: 10 }}>
      <p role="status" className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>
        {status === 'connecting' && '목소리를 연결하는 중…'}
        {status === 'live' && (muted ? '소리가 꺼져 있어요' : '통화 중 — 편하게 말하세요')}
        {(status === 'ended' || status === 'error') && (detail ?? '실시간 연결이 끝났어요.')}
      </p>
      {muted && status !== 'ended' && status !== 'error' && (
        <button type="button" onClick={unmute} className="t-caption"
          style={{ marginTop: 10, minHeight: 44, padding: '0 18px', borderRadius: 22, border: 0, background: 'var(--color-accent)', color: 'var(--color-white)', cursor: 'pointer' }}>
          소리 켜기
        </button>
      )}
    </div>
  )
}

/** 기기 샘플레이트(보통 48kHz)를 16kHz PCM16 으로 줄인다. 구간 평균이라 단순 솎기보다 잡음이 덜 접힌다. */
export function toPcm16(input: Float32Array, from: number, to = 16000): Int16Array {
  const ratio = from / to
  const length = Math.floor(input.length / ratio)
  const out = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio), end = Math.max(start + 1, Math.min(input.length, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]!
    out[i] = Math.max(-32768, Math.min(32767, Math.round((sum / (end - start)) * 32767)))
  }
  return out
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
