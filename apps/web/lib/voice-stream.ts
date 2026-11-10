/**
 * 11/11 만드는 대로 듣기 — /api/tts 가 흘려보내는 PCM16 조각(audio/L16, x-sample-rate)을 오는 대로 이어 붙여 재생한다.
 * 묶음 사이 쉼은 gap 으로 시각을 미룬다. <audio> 는 아직 다 안 온 소리를 재생하지 못해 Web Audio 로 시각을 직접 잡는다.
 * iOS 는 사용자 손짓 안에서 unlock() 을 한 번 불러야 소리가 난다.
 */
export class VoiceStreamPlayer {
  private ctx: AudioContext | null = null
  private next = 0
  private sources = new Set<AudioBufferSourceNode>()

  unlock() {
    this.ctx ??= new AudioContext()
    void this.ctx.resume().catch(() => {})
  }

  /** 다음 묶음 앞의 쉼(대사 사이 pauseAfterMs). */
  gap(ms: number) { if (this.ctx && ms > 0) this.next = Math.max(this.next, this.ctx.currentTime) + ms / 1000 }

  stop() {
    for (const s of this.sources) { try { s.stop() } catch { /* 이미 끝남 */ } }
    this.sources.clear(); this.next = 0
  }

  /**
   * 응답을 끝까지 받아 재생 시각에 올린다. 받기가 끝나면 돌아오고(다음 묶음 요청을 바로 시작할 수 있게), ended 는 마지막 소리가 끝날 때.
   * L16 이 아니면(예전 WAV) 통째로 풀어 한 번에 올린다.
   */
  async feed(response: Response, signal: AbortSignal, onStart: () => void): Promise<{ ended: Promise<void> }> {
    this.unlock()
    const ctx = this.ctx!
    let last: AudioBufferSourceNode | null = null, started = false
    const schedule = (buffer: AudioBuffer) => {
      if (signal.aborted) return
      const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination)
      // 쉬고 있었으면 조금 늦게 시작해 다음 조각이 올 여유를 둔다(조각 사이 끊김 방지).
      const at = Math.max(this.next, ctx.currentTime + (this.next < ctx.currentTime ? 0.15 : 0))
      src.start(at); this.next = at + buffer.duration
      this.sources.add(src); src.onended = () => this.sources.delete(src)
      last = src
      if (!started) { started = true; onStart() }
    }
    const abort = () => this.stop()
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (response.headers.get('content-type')?.startsWith('audio/L16') && response.body) {
        const rate = Number(response.headers.get('x-sample-rate')) || 44100
        const reader = response.body.getReader()
        let carry: Uint8Array | null = null
        for (;;) {
          const { value, done } = await reader.read()
          if (done || signal.aborted) break
          let bytes: Uint8Array = carry ? concat(carry, value) : value
          carry = bytes.length % 2 ? bytes.slice(-1) : null
          if (carry) bytes = bytes.subarray(0, bytes.length - 1)
          if (!bytes.length) continue
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = bytes.length / 2
          const buffer = ctx.createBuffer(1, n, rate), data = buffer.getChannelData(0)
          for (let i = 0; i < n; i++) data[i] = view.getInt16(i * 2, true) / 32768
          schedule(buffer)
        }
      } else schedule(await ctx.decodeAudioData(await response.arrayBuffer()))
    } finally { signal.removeEventListener('abort', abort) }
    const final = last as AudioBufferSourceNode | null
    return { ended: !final || signal.aborted ? Promise.resolve() : new Promise<void>(resolve => {
      const done = () => { signal.removeEventListener('abort', done); resolve() }
      final.addEventListener('ended', done, { once: true }); signal.addEventListener('abort', done, { once: true })
    }) }
  }
}

function concat(a: Uint8Array, b: Uint8Array) { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out }
