import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_LINES, activate, confirmRights, create, inspect, preview, register, retire, review, setTranscript, sha256File, transcribe } from './import'

const hasFfmpeg = (() => { try { execFileSync('ffprobe', ['-version']); execFileSync('ffmpeg', ['-version']); return true } catch { return false } })()
const dir = mkdtempSync(join(tmpdir(), 'miro-voice-test-'))
const log = join(dir, 'calls.log')
const tone = (name: string, freq: number, seconds: number, channels = 1) =>
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, '-ac', String(channels), join(dir, name)])
/** 엔진·Whisper 대신 부른 명령. 실제 모델(약 3.2GB)을 받지 않고 순서·인자·결과 처리만 본다. */
const calls = (): string[][] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as string[]) : []

const FAKE_ENGINE = `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const [cmd, ...rest] = process.argv.slice(2)
const arg = k => rest[rest.indexOf(k) + 1]
appendFileSync(process.env.FAKE_LOG, JSON.stringify(['engine', cmd, ...rest]) + '\\n')
if (process.env.FAKE_FAIL === cmd) { console.error('Traceback (most recent call last):\\nRuntimeError: MPS backend out of memory'); process.exit(1) }
const info = { engine: 'chatterbox-tts', version: '0.1.7', model: 't3_mtl23ls_v2', revision: '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18' }
if (cmd === 'prepare') {
  writeFileSync(arg('--out'), 'conds:' + createHash('sha256').update(readFileSync(arg('--reference'))).digest('hex'))
  console.log('loading…'); console.log(JSON.stringify({ ...info, device: 'mps', loadMs: 11, ms: 22 }))
} else if (cmd === 'speak') {
  const items = JSON.parse(readFileSync(arg('--lines'), 'utf8')).map((l, n) => {
    const file = arg('--out-dir') + '/' + (n + 1) + '-' + l.kind + '.wav'
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1', '-ar', '24000', file])
    return { kind: l.kind, file, ms: 33 }
  })
  console.log(JSON.stringify({ ...info, device: 'mps', loadMs: 11, sampleRate: 24000, items }))
}
`
const FAKE_WHISPER = `#!/usr/bin/env node
const { appendFileSync, writeFileSync } = require('node:fs')
const { basename, extname } = require('node:path')
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_LOG, JSON.stringify(['whisper', ...args]) + '\\n')
const out = args[args.indexOf('--output_dir') + 1]
writeFileSync(out + '/' + basename(args[0], extname(args[0])) + '.txt', '받아 적은 문장입니다 ' + basename(args[0]) + '\\n')
`

describe.skipIf(!hasFfmpeg)('operator voice import workflow (local engine)', () => {
  beforeAll(() => {
    tone('a.wav', 220, 12); tone('b.wav', 330, 11); tone('stereo.wav', 550, 3, 2)
    writeFileSync(join(dir, 'a.txt'), '안녕하세요. 오늘은 제 목소리를 녹음해 보겠습니다.')
    writeFileSync(join(dir, 'broken.mp3'), Buffer.from('not really audio'))
    writeFileSync(join(dir, 'engine.mjs'), FAKE_ENGINE)
    writeFileSync(join(dir, 'whisper.cjs'), FAKE_WHISPER); chmodSync(join(dir, 'whisper.cjs'), 0o755)
    vi.stubEnv('MIRO_VOICE_WORKDIR', join(dir, 'work'))
    vi.stubEnv('MIRO_VOICE_PYTHON', process.execPath)
    vi.stubEnv('MIRO_VOICE_ENGINE', join(dir, 'engine.mjs'))
    vi.stubEnv('MIRO_VOICE_WHISPER', join(dir, 'whisper.cjs'))
    vi.stubEnv('XDG_CACHE_HOME', join(dir, 'cache'))
    vi.stubEnv('FAKE_LOG', log)
  })
  beforeEach(() => { writeFileSync(log, ''); vi.stubEnv('FAKE_FAIL', '') })
  afterAll(() => vi.unstubAllEnvs())

  it('inspects without touching the originals and reports only what the tools measured', async () => {
    const before = [await sha256File(join(dir, 'a.wav')), statSync(join(dir, 'a.wav')).mtimeMs]
    const byName = Object.fromEntries((await inspect([dir])).map(p => [p.path.split('/').pop(), p]))
    expect(byName['a.wav']).toMatchObject({ channels: 1, codec: 'pcm_s16le', problems: [], transcript: '안녕하세요. 오늘은 제 목소리를 녹음해 보겠습니다.' })
    expect(byName['a.wav']!.durationSec).toBeCloseTo(12, 0)
    expect(byName['broken.mp3']!.problems.length).toBeGreaterThan(0)
    expect(byName['stereo.wav']!.notes.join()).toContain('2채널')
    expect(byName['stereo.wav']!.notes.join()).toContain('10초 미만')
    expect([await sha256File(join(dir, 'a.wav')), statSync(join(dir, 'a.wav')).mtimeMs]).toEqual(before)
    expect(calls()).toEqual([])
  })

  it('only groups files the operator named, and never twice', async () => {
    await expect(create({ id: 'test-voice', label: '테스트', files: [dir] })).rejects.toThrow('폴더는 받지 않습니다')
    await expect(create({ id: 'test-voice', label: '테스트', files: [join(dir, 'broken.mp3')] })).rejects.toThrow('쓸 수 없는 파일')
    const v = await create({ id: 'test-voice', label: '테스트', files: [join(dir, 'a.wav'), join(dir, 'b.wav')] })
    expect(v.samples.map(s => s.transcriptSource)).toEqual(['sidecar', null])
    expect((await create({ id: 'test-voice', label: '테스트', files: [join(dir, 'b.wav'), join(dir, 'a.wav')] })).fingerprint).toBe(v.fingerprint)
    await expect(create({ id: 'other-voice', label: '다른', files: [join(dir, 'a.wav'), join(dir, 'b.wav')] })).rejects.toThrow('이미 test-voice')
  })

  it('registers once from a reference copy, only after rights are confirmed, and reuses the voice file', async () => {
    await expect(register({ id: 'test-voice' })).rejects.toThrow('confirm-rights')
    await confirmRights({ id: 'test-voice', basis: 'written_consent', holder: '성우 A', evidence: '계약서 2026-09-25', by: '운영자' })
    const original = await sha256File(join(dir, 'a.wav'))
    const v = await register({ id: 'test-voice' })
    const p = v.provider!
    expect(calls()).toEqual([['engine', 'prepare', '--reference', p.reference.clip, '--out', p.artifact]])
    expect(p.reference.clip).not.toBe(join(dir, 'a.wav'))
    expect(p).toMatchObject({ name: 'chatterbox', device: 'mps', loadMs: 11, prepareMs: 22, engine: { version: '0.1.7', model: 't3_mtl23ls_v2' } })
    expect(p.voiceId).toBe(await sha256File(p.artifact))
    expect(p.reference.clipSec).toBeLessThanOrEqual(10.05)
    expect(await sha256File(join(dir, 'a.wav'))).toBe(original)

    writeFileSync(log, '')
    await register({ id: 'test-voice' })
    expect(calls()).toEqual([])
    const other = await register({ id: 'test-voice', reference: 'b.wav' })
    expect(other.provider!.voiceId).not.toBe(p.voiceId)
    await register({ id: 'test-voice', reference: 'a.wav' })
  })

  it('transcribes locally for free, but downloads the Whisper model only when allowed', async () => {
    await expect(transcribe({ id: 'test-voice' })).rejects.toThrow('--allow-download')
    const v = await transcribe({ id: 'test-voice', allowDownload: true })
    expect(v.samples.map(s => s.transcriptSource)).toEqual(['sidecar', 'whisper'])
    expect(v.samples[1]!.transcript).toBe('받아 적은 문장입니다 b.wav')
    const [whisper] = calls()
    expect(whisper!.slice(0, 6)).toEqual(['whisper', join(dir, 'b.wav'), '--model', 'small', '--language', 'ko'])
    mkdirSync(join(dir, 'cache', 'whisper'), { recursive: true }); writeFileSync(join(dir, 'cache', 'whisper', 'small.pt'), 'model')
    expect((await transcribe({ id: 'test-voice' })).asr?.model).toBe('small')
  })

  it('previews three new Korean lines from the saved voice file, never from the recording', async () => {
    const v = await preview({ id: 'test-voice' })
    const [speak] = calls()
    expect(speak!.slice(0, 4)).toEqual(['engine', 'speak', '--voice', v.provider!.artifact])
    expect(speak!.join(' ')).not.toContain('a.wav')
    expect(v.previews!.items.map(i => i.kind)).toEqual(['statement', 'question', 'emotion'])
    expect(v.previews!.items[1]!.text).toContain('?')
    for (const item of v.previews!.items) { expect(item.latencyMs).toBe(33); expect(item.durationSec).toBeGreaterThan(0.5) }
    expect(v.previews!.voiceId).toBe(v.provider!.voiceId)

    vi.stubEnv('FAKE_FAIL', 'speak')
    await expect(preview({ id: 'test-voice' })).rejects.toThrow('MPS backend out of memory')
    const after = await review({ id: 'test-voice', decision: 'rejected', by: '운영자', note: '실패 뒤에도 이전 미리 듣기가 남는다' })
    expect(after.previews!.items).toHaveLength(3)
    expect(after.errors.map(e => e.step)).toContain('preview')
  })

  it('refuses preview lines the recording already contains, but not because of a one-word take', async () => {
    tone('d.wav', 660, 12); tone('e.wav', 770, 12)
    await create({ id: 'echo-voice', label: '겹침', files: [join(dir, 'd.wav'), join(dir, 'e.wav')] })
    await setTranscript({ id: 'echo-voice', file: 'd.wav', text: '녹음 첫 문장입니다.' })
    // 감정 대사("정말 다행이다. 네가 …")에 '네'가 들어 있지만 한 마디 녹음은 대사를 겹치게 만들지 않는다.
    await setTranscript({ id: 'echo-voice', file: 'e.wav', text: '네.' })
    await confirmRights({ id: 'echo-voice', basis: 'own_voice', holder: '운영자', evidence: '본인 녹음', by: '운영자' })
    await register({ id: 'echo-voice' })
    expect((await preview({ id: 'echo-voice' })).previews!.items).toHaveLength(3)

    await setTranscript({ id: 'echo-voice', file: 'd.wav', text: `녹음 첫 문장. ${PREVIEW_LINES[1].text}` })
    writeFileSync(log, '')
    await expect(preview({ id: 'echo-voice' })).rejects.toThrow('d.wav')
    expect(calls()).toEqual([])
  })

  it('needs the operator to approve the exact preview files, and a tampered voice file blocks everything', async () => {
    await expect(activate({ id: 'test-voice', dbHost: 'localhost' })).rejects.toThrow('approve')
    const v = await review({ id: 'test-voice', decision: 'approved', by: '운영자' })
    expect(v.review!.previewSha256).toHaveLength(3)
    const heard = readFileSync(v.previews!.items[0]!.file)
    writeFileSync(v.previews!.items[0]!.file, 'tampered')
    await expect(review({ id: 'test-voice', decision: 'approved', by: '운영자' })).rejects.toThrow('바뀌었습니다')
    writeFileSync(v.previews!.items[0]!.file, heard)

    const artifact = readFileSync(v.provider!.artifact)
    writeFileSync(v.provider!.artifact, 'tampered')
    await expect(preview({ id: 'test-voice' })).rejects.toThrow('목소리 파일')
    await expect(activate({ id: 'test-voice', dbHost: 'localhost' })).rejects.toThrow('목소리 파일')
    writeFileSync(v.provider!.artifact, artifact)
  })

  it.skipIf(!process.env.DATABASE_URL)('activates into and retires from the official library on the named database only', async () => {
    const { db, officialVoices, eq } = await import('../../packages/db/src/index')
    await review({ id: 'test-voice', decision: 'approved', by: '운영자' })
    await expect(activate({ id: 'test-voice', dbHost: 'db.example.supabase.co' })).rejects.toThrow('--db-host')
    const host = new URL(process.env.DATABASE_URL!).hostname
    try {
      const v = await activate({ id: 'test-voice', dbHost: host })
      const [row] = await db.select().from(officialVoices).where(eq(officialVoices.id, 'test-voice'))
      expect(row).toMatchObject({ label: '테스트', provider: 'chatterbox', providerVoiceId: v.provider!.voiceId, status: 'active', retiredAt: null })
      expect(row!.rights).toMatchObject({ basis: 'written_consent', holder: '성우 A' })
      expect(row!.approval).toMatchObject({ decision: 'approved', engine: { model: 't3_mtl23ls_v2', revision: '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18' } })
      await retire({ id: 'test-voice', dbHost: host })
      const [after] = await db.select().from(officialVoices).where(eq(officialVoices.id, 'test-voice'))
      expect(after!.status).toBe('retired')
    } finally {
      await db.delete(officialVoices).where(eq(officialVoices.id, 'test-voice'))
    }
  })
})
