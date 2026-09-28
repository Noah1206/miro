/**
 * 운영자 전용 공식 보이스 등록 — `.claude/skills/miro-voice-import` 가 이 순서로 부른다.
 *   inspect → create → (set-transcript | transcribe) → confirm-rights → register → preview → approve|reject → activate (→ retire)
 *
 * 엔진은 로컬 무료 모델이다: 목소리 복제·대사는 Chatterbox Multilingual(`chatterbox_engine.py`, MIT),
 * 전사는 Whisper(MIT). 녹음·목소리 파일은 이 PC 밖으로 나가지 않고, 유료 API 를 부르는 경로가 없다.
 * 프로덕션 코드는 이 파일을 import 하지 않는다.
 *
 * 작업 기록(샘플 경로·해시·전사문·권한 확인·목소리 파일·미리 듣기·승인)은 MIRO_VOICE_WORKDIR(기본 ~/.miro/voices)의 registry.json.
 * 저장소 안이면 거부한다. 원본 녹음은 읽기만 한다 — 참조 클립은 작업 폴더에 사본으로 만든다.
 * 큰 내려받기(가중치 약 3.2GB, Whisper small 약 461MB)는 fetch·--allow-download 로만 일어난다.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify, parseArgs } from 'node:util'

const run = promisify(execFile)
/** 참조 클립으로 쓸 수 있는 형식. 엔진(librosa)은 더 읽지만, 확인한 형식만 받는다. */
const READABLE = new Set(['.wav', '.mp3', '.m4a', '.flac', '.opus', '.ogg'])
const AUDIO_EXT = new Set([...READABLE, '.aac', '.oga', '.aif', '.aiff', '.caf', '.webm', '.mp4', '.wma'])
const ENGINE = fileURLToPath(new URL('./chatterbox_engine.py', import.meta.url))
const WHISPER_MODEL = 'small'

/** 녹음에 없는 새 대사 — 평서문·질문·감정. 받침·연음·구개음화(같이, 끓여, 괜찮아, 골목이)를 일부러 넣었다. */
export const PREVIEW_LINES = [
  { kind: 'statement', text: '오늘은 창밖에 비가 조용히 내려서, 따뜻한 보리차를 한 잔 끓여 두었어.' },
  { kind: 'question', text: '내일 저녁에 잠깐 시간 괜찮아? 같이 걷고 싶은 골목이 하나 있거든.' },
  { kind: 'emotion', text: '정말 다행이다. 네가 무사히 돌아와서, 나 지금 눈물이 날 것 같아.' },
] as const

export type Probe = {
  path: string; sha256: string; bytes: number; format: string; codec: string
  durationSec: number; channels: number; sampleRate: number; bitRate: number | null
  peakDb: number | null; meanDb: number | null
  /** 막는 문제 — 등록에 쓸 수 없다. */
  problems: string[]
  /** 측정값에서 나온 참고 — 음질 판정이 아니다. 듣고 판단하는 건 운영자다. */
  notes: string[]
}
type Sample = Omit<Probe, 'problems' | 'notes'> & { notes: string[]; transcript: string | null; transcriptSource: 'sidecar' | 'operator' | 'whisper' | null }
type EngineInfo = { engine: string; version: string; model: string; revision: string }
export type Voice = {
  id: string; label: string; createdAt: string; fingerprint: string; samples: Sample[]
  rights?: { basis: 'own_voice' | 'written_consent' | 'license'; holder: string; evidence: string; confirmedBy: string; confirmedAt: string }
  asr?: { engine: 'openai-whisper'; model: string; at: string }
  /** 엔진이 실제로 만든 목소리 파일. voiceId 는 그 파일의 sha256 — 라이브러리의 provider_voice_id 다. */
  provider?: { name: 'chatterbox'; voiceId: string; artifact: string; engine: EngineInfo; device: string
    reference: { sample: string; sha256: string; clip: string; clipSha256: string; clipSec: number }; registeredAt: string; loadMs: number; prepareMs: number }
  previews?: { voiceId: string; engine: EngineInfo; device: string; loadMs: number; at: string
    items: Array<{ kind: string; text: string; file: string; sha256: string; latencyMs: number; durationSec: number }> }
  review?: { decision: 'approved' | 'rejected'; by: string; at: string; note: string; previewSha256: string[] }
  library?: { status: 'active' | 'retired'; at: string; dbHost: string }
  errors: Array<{ step: string; at: string; message: string }>
}
type Registry = { version: 1; voices: Record<string, Voice> }

const now = () => new Date().toISOString()
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/

/* ─────────────── 작업 폴더 ─────────────── */

export function workdir(): string {
  return resolve(process.env.MIRO_VOICE_WORKDIR || join(homedir(), '.miro', 'voices'))
}

async function ensureWorkdir(): Promise<string> {
  const dir = workdir()
  await mkdir(dir, { recursive: true })
  // 저장소 안에 두면 전사문·경로·목소리 파일·미리 듣기가 커밋될 수 있다.
  const inGit = await run('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']).then(r => r.stdout.trim() === 'true', () => false)
  if (inGit) throw new Error(`작업 폴더가 git 저장소 안입니다: ${dir} — MIRO_VOICE_WORKDIR 를 저장소 밖으로 두세요`)
  return dir
}

async function load(): Promise<Registry> {
  const file = join(await ensureWorkdir(), 'registry.json')
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) as Registry : { version: 1, voices: {} }
}

async function save(reg: Registry): Promise<void> {
  const file = join(await ensureWorkdir(), 'registry.json')
  await writeFile(`${file}.tmp`, JSON.stringify(reg, null, 2))
  await rename(`${file}.tmp`, file)
}

function voiceOf(reg: Registry, id: string): Voice {
  const v = reg.voices[id]
  if (!v) throw new Error(`등록 기록에 없는 보이스입니다: ${id}`)
  return v
}

/* ─────────────── 파일 검사 (읽기만) ─────────────── */

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/**
 * 존재·형식·길이·채널·손상 여부를 도구로 잰다. 음질을 판정하지 않는다 — 숫자만 남긴다.
 * 손상: ffmpeg 로 끝까지 디코딩해 오류가 하나라도 나오면 막는다(-xerror).
 */
export async function probe(path: string): Promise<Probe> {
  const out: Probe = { path: resolve(path), sha256: '', bytes: 0, format: '', codec: '', durationSec: 0, channels: 0, sampleRate: 0, bitRate: null, peakDb: null, meanDb: null, problems: [], notes: [] }
  const info = await stat(out.path).catch(() => null)
  if (!info?.isFile()) return { ...out, problems: ['파일이 없습니다'] }
  out.bytes = info.size
  out.sha256 = await sha256File(out.path)
  const ext = extname(out.path).toLowerCase()
  if (!READABLE.has(ext)) out.problems.push(`받지 않는 형식(${ext || '확장자 없음'}) — wav·mp3·m4a·flac·opus·ogg 로 변환한 사본이 필요합니다`)

  const probed = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', out.path])
    .then(r => JSON.parse(r.stdout) as { format?: Record<string, string>; streams?: Array<Record<string, string | number>> }, (e: Error) => ({ error: e.message }))
  if ('error' in probed) return { ...out, problems: [...out.problems, `ffprobe 가 읽지 못했습니다: ${probed.error.split('\n').slice(-2).join(' ').slice(0, 200)}`] }
  const audio = probed.streams?.find(s => s.codec_type === 'audio')
  if (!audio) return { ...out, problems: [...out.problems, '오디오 스트림이 없습니다'] }
  out.format = String(probed.format?.format_name ?? '')
  out.codec = String(audio.codec_name ?? '')
  out.durationSec = Number(probed.format?.duration ?? audio.duration ?? 0)
  out.channels = Number(audio.channels ?? 0)
  out.sampleRate = Number(audio.sample_rate ?? 0)
  out.bitRate = probed.format?.bit_rate ? Number(probed.format.bit_rate) : null
  if (!(out.durationSec > 0)) out.problems.push('길이가 0 입니다')

  const decoded = await run('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', out.path, '-map', '0:a:0', '-f', 'null', '-'])
    .then(r => r.stderr.trim(), (e: Error & { stderr?: string }) => (e.stderr || e.message).trim() || 'decode failed')
  if (decoded) out.problems.push(`디코딩 오류(손상 가능): ${decoded.split('\n')[0]!.slice(0, 200)}`)

  const levels = await run('ffmpeg', ['-nostdin', '-hide_banner', '-i', out.path, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'])
    .then(r => r.stderr, () => '')
  const level = (name: string) => { const m = levels.match(new RegExp(`${name}:\\s*(-?[\\d.]+|-inf) dB`)); return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null }
  out.peakDb = level('max_volume'); out.meanDb = level('mean_volume')

  if (out.durationSec > 0 && out.durationSec < 10) out.notes.push('10초 미만 (엔진은 참조 녹음의 앞 10초를 쓴다)')
  if (out.channels > 1) out.notes.push(`${out.channels}채널 (참조 클립은 모노로 만든다)`)
  if (out.peakDb !== null && out.peakDb >= -0.1) out.notes.push('최대 레벨 0 dBFS — 클리핑 가능성')
  if (out.meanDb === -Infinity) out.problems.push('소리가 없습니다(무음)')
  else if (out.meanDb !== null && out.meanDb < -60) out.notes.push(`평균 레벨 ${out.meanDb.toFixed(1)} dB — 거의 무음`)
  return out
}

async function audioFiles(paths: string[]): Promise<string[]> {
  const files: string[] = []
  for (const p of paths) {
    const info = await stat(p).catch(() => null)
    if (info?.isDirectory()) {
      for (const entry of (await readdir(p, { recursive: true })).sort()) {
        const full = join(p, entry)
        if (!basename(full).startsWith('.') && AUDIO_EXT.has(extname(full).toLowerCase())) files.push(resolve(full))
      }
    } else files.push(resolve(p))
  }
  return files
}

async function sidecarTranscript(path: string): Promise<string | null> {
  const txt = join(dirname(path), `${basename(path, extname(path))}.txt`)
  return existsSync(txt) ? (await readFile(txt, 'utf8')).normalize('NFC').trim() || null : null
}

function describeProbe(p: Probe): string {
  const db = (n: number | null) => n === null ? '?' : n === -Infinity ? '-inf' : n.toFixed(1)
  return p.problems.length
    ? `✗ ${p.path}\n    ${p.problems.join('\n    ')}`
    : `✓ ${p.path}\n    ${p.format}/${p.codec} ${p.durationSec.toFixed(1)}s ${p.channels}ch ${p.sampleRate}Hz peak ${db(p.peakDb)}dB mean ${db(p.meanDb)}dB sha256 ${p.sha256.slice(0, 12)}${p.notes.length ? `\n    참고: ${p.notes.join(' · ')}` : ''}`
}

/** 폴더나 파일을 읽기만 한다. 같은 목소리인지는 묻지 않고 가정하지도 않는다 — 묶는 건 create 에서 운영자가 한다. */
export async function inspect(paths: string[]): Promise<Array<Probe & { transcript: string | null }>> {
  const out: Array<Probe & { transcript: string | null }> = []
  for (const file of await audioFiles(paths)) out.push({ ...await probe(file), transcript: await sidecarTranscript(file) })
  return out
}

/* ─────────────── 등록 기록 ─────────────── */

/** 운영자가 같은 목소리라고 묶은 파일만 하나의 보이스가 된다. 폴더는 받지 않는다 — 다른 목소리가 섞여 들어가지 않게. */
export async function create(opts: { id: string; label: string; files: string[] }): Promise<Voice> {
  if (!ID.test(opts.id)) throw new Error('id 는 영문 소문자·숫자·하이픈 2~40자입니다 (예: warm-boy-01)')
  const label = opts.label.trim()
  if (!label || label.length > 30) throw new Error('표시 이름은 1~30자입니다')
  if (!opts.files.length) throw new Error('같은 목소리로 묶을 파일을 하나 이상 지정하세요')
  const reg = await load()
  const samples: Sample[] = []
  for (const file of opts.files) {
    if ((await stat(file).catch(() => null))?.isDirectory()) throw new Error(`폴더는 받지 않습니다 — 같은 목소리 파일만 골라 주세요: ${file}`)
    const p = await probe(file)
    if (p.problems.length) throw new Error(`쓸 수 없는 파일:\n${describeProbe(p)}`)
    const transcript = await sidecarTranscript(p.path)
    const { problems: _, ...rest } = p
    samples.push({ ...rest, transcript, transcriptSource: transcript ? 'sidecar' : null })
  }
  if (new Set(samples.map(s => s.sha256)).size !== samples.length) throw new Error('같은 파일이 두 번 들어 있습니다')
  const fingerprint = createHash('sha256').update(samples.map(s => s.sha256).sort().join('\n')).digest('hex')
  const same = Object.values(reg.voices).find(v => v.fingerprint === fingerprint)
  if (same) {
    if (same.id === opts.id) return same
    throw new Error(`같은 샘플이 이미 ${same.id} 로 기록돼 있습니다 — 중복 등록하지 않습니다`)
  }
  if (reg.voices[opts.id]) throw new Error(`${opts.id} 는 다른 샘플로 이미 있습니다`)
  const voice: Voice = { id: opts.id, label, createdAt: now(), fingerprint, samples, errors: [] }
  reg.voices[opts.id] = voice
  await save(reg)
  return voice
}

function sampleOf(v: Voice, file: string): Sample {
  const s = v.samples.find(x => x.path === resolve(file) || basename(x.path) === file)
  if (!s) throw new Error(`이 보이스의 샘플이 아닙니다: ${file}`)
  return s
}

export async function setTranscript(opts: { id: string; file: string; text: string }): Promise<Voice> {
  const reg = await load(), v = voiceOf(reg, opts.id), s = sampleOf(v, opts.file)
  const text = opts.text.normalize('NFC').trim()
  if (!text) throw new Error('전사문이 비었습니다')
  s.transcript = text; s.transcriptSource = 'operator'
  await save(reg)
  return v
}

export async function confirmRights(opts: { id: string; basis: string; holder: string; evidence: string; by: string }): Promise<Voice> {
  if (!['own_voice', 'written_consent', 'license'].includes(opts.basis)) throw new Error('basis 는 own_voice | written_consent | license 입니다')
  if (!opts.holder.trim() || !opts.evidence.trim() || !opts.by.trim()) throw new Error('권리자·근거·확인자를 모두 적어야 합니다')
  const reg = await load(), v = voiceOf(reg, opts.id)
  v.rights = { basis: opts.basis as NonNullable<Voice['rights']>['basis'], holder: opts.holder.trim(), evidence: opts.evidence.trim(), confirmedBy: opts.by.trim(), confirmedAt: now() }
  await save(reg)
  return v
}

/* ─────────────── 로컬 엔진 (무료 · 이 PC 안에서만) ─────────────── */

function python(): string {
  return process.env.MIRO_VOICE_PYTHON || join(workdir(), '.venv', 'bin', 'python')
}

/**
 * 정상이면 모델 로드 1분 안팎, 대사 한 줄 수십 초다. 8GB Mac 에서 메모리가 모자라면 스왑 때문에 토큰 하나에 40초가 넘게 걸려
 * 한 줄에 몇 시간이 된다(2026-09-25 실측) — 그래서 15분에 끊는다. 내려받기(fetch)만 길게 둔다.
 */
async function engine<T>(args: string[], timeoutMs = 15 * 60_000): Promise<T> {
  const py = python()
  if (!existsSync(py)) throw new Error(`로컬 엔진이 설치돼 있지 않습니다(${py}) — 스킬의 '엔진 준비' 단계를 먼저 하세요`)
  const r = await run(py, [process.env.MIRO_VOICE_ENGINE || ENGINE, ...args], { maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs })
    .catch((e: Error & { stderr?: string }) => {
      const tail = (e.stderr || e.message).trim().split('\n').slice(-3).join(' ').slice(0, 400)
      if ((e as { killed?: boolean }).killed) throw new Error(`엔진이 ${timeoutMs / 60_000}분 안에 끝나지 않아 멈췄습니다 — 메모리가 모자라 스왑을 쓰는지 보세요(sysctl vm.swapusage). 다른 앱을 닫고 다시 하세요`)
      throw new Error(/LocalEntryNotFound|local_files_only|offline/i.test(tail) ? `모델 가중치가 없습니다 — 'pnpm voice fetch'(약 3.2GB)를 승인받고 먼저 하세요` : `엔진 실패: ${tail}`)
    })
  return JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as T
}

/** 가중치 받기(약 3.2GB). 이것만 인터넷에서 받는다 — 녹음은 올리지 않는다. */
export async function fetchWeights(): Promise<EngineInfo & { path: string; ms: number }> {
  return engine(['fetch'], 60 * 60_000)
}

/** 전사문이 없는 샘플을 로컬 Whisper 로 받아 적는다. 무료지만 모델(small, 약 461MB)이 없으면 --allow-download 가 있어야 받는다. */
export async function transcribe(opts: { id: string; allowDownload?: boolean }): Promise<Voice> {
  const reg = await load(), v = voiceOf(reg, opts.id)
  const todo = v.samples.filter(s => !s.transcript)
  if (!todo.length) return v
  const model = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'whisper', `${WHISPER_MODEL}.pt`)
  if (!existsSync(model) && !opts.allowDownload) throw new Error(`Whisper ${WHISPER_MODEL} 모델(약 461MB)을 처음 받아야 합니다 — 승인받고 --allow-download`)
  const whisper = process.env.MIRO_VOICE_WHISPER || join(dirname(python()), 'whisper')
  if (!existsSync(whisper)) throw new Error(`Whisper 가 설치돼 있지 않습니다(${whisper}) — 스킬의 '엔진 준비' 단계를 먼저 하세요`)
  const out = await mkdtemp(join(tmpdir(), 'miro-whisper-'))
  try {
    for (const s of todo) {
      if (await sha256File(s.path) !== s.sha256) throw new Error(`원본이 바뀌었습니다: ${s.path}`)
      await run(whisper, [s.path, '--model', WHISPER_MODEL, '--language', 'ko', '--output_format', 'txt', '--output_dir', out, '--fp16', 'False', '--verbose', 'False'], { timeout: 30 * 60_000 })
        .catch(async (e: Error & { stderr?: string }) => { v.errors.push({ step: 'transcribe', at: now(), message: (e.stderr || e.message).slice(-400) }); await save(reg); throw e })
      const text = (await readFile(join(out, `${basename(s.path, extname(s.path))}.txt`), 'utf8')).normalize('NFC').trim()
      s.transcript = text || null
      s.transcriptSource = text ? 'whisper' : null
    }
  } finally { await rm(out, { recursive: true, force: true }) }
  v.asr = { engine: 'openai-whisper', model: WHISPER_MODEL, at: now() }
  await save(reg)
  return v
}

/**
 * 엔진은 참조 녹음의 앞부분만 쓴다(S3Gen 10초·T3 6초). 앞쪽 무음을 걷어 낸 모노 24kHz 10초 사본을 작업 폴더에 만든다.
 * 원본은 읽기만 한다.
 */
async function referenceClip(src: string, out: string): Promise<void> {
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', src, '-map', '0:a:0', '-af', 'silenceremove=start_periods=1:start_threshold=-50dB',
    '-t', '10', '-ac', '1', '-ar', '24000', out])
}

async function artifactOk(p: NonNullable<Voice['provider']>): Promise<boolean> {
  return existsSync(p.artifact) && await sha256File(p.artifact) === p.voiceId
}

/**
 * 목소리 등록 = 참조 클립으로 엔진이 목소리 파일(Conditionals)을 한 번 만드는 것. 대사는 이후 이 파일로만 읽는다.
 * 같은 참조로 이미 만든 파일이 그대로 있으면 다시 만들지 않는다.
 * 참조를 바꾸면 새로 만들고, 이전 파일로 만든 미리 듣기·승인은 지운다.
 */
export async function register(opts: { id: string; reference?: string }): Promise<Voice> {
  const reg = await load(), v = voiceOf(reg, opts.id)
  if (!v.rights) throw new Error('복제·서비스 사용 권한 확인(confirm-rights)이 없습니다')
  const sample = opts.reference ? sampleOf(v, opts.reference) : v.samples[0]!
  if (await sha256File(sample.path) !== sample.sha256) throw new Error(`원본이 바뀌었습니다: ${sample.path} — create 를 다시 하세요`)
  if (v.provider && v.provider.reference.sha256 === sample.sha256 && await artifactOk(v.provider)) return v

  const dir = join(await ensureWorkdir(), 'voices', v.id)
  await mkdir(dir, { recursive: true })
  const clip = join(dir, 'reference.wav'), artifact = join(dir, 'voice.pt')
  await referenceClip(sample.path, clip)
  const clipProbe = await probe(clip)
  if (clipProbe.problems.length) throw new Error(`참조 클립을 만들지 못했습니다:\n${describeProbe(clipProbe)}`)
  const r = await engine<EngineInfo & { device: string; loadMs: number; ms: number }>(['prepare', '--reference', clip, '--out', artifact])
    .catch(async (e: Error) => { v.errors.push({ step: 'register', at: now(), message: e.message }); await save(reg); throw e })
  if (!existsSync(artifact)) throw new Error('엔진이 목소리 파일을 만들지 않았습니다')
  v.provider = { name: 'chatterbox', voiceId: await sha256File(artifact), artifact, device: r.device,
    engine: { engine: r.engine, version: r.version, model: r.model, revision: r.revision },
    reference: { sample: sample.path, sha256: sample.sha256, clip, clipSha256: clipProbe.sha256, clipSec: clipProbe.durationSec },
    registeredAt: now(), loadMs: r.loadMs, prepareMs: r.ms }
  if (v.previews?.voiceId !== v.provider.voiceId) { delete v.previews; delete v.review }
  await save(reg)
  return v
}

function squash(s: string): string {
  return s.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 저장한 목소리 파일로 녹음에 없는 대사 3개를 읽는다. 전사문이 있어야 '녹음에 없다'를 확인할 수 있다.
 * 새로 만들면 이전 승인은 지운다 — 들은 파일과 승인이 어긋나지 않게.
 */
export async function preview(opts: { id: string }): Promise<Voice> {
  const reg = await load(), v = voiceOf(reg, opts.id)
  const p = v.provider
  if (!p) throw new Error(`${v.id} 는 아직 등록 전입니다 (register)`)
  if (!await artifactOk(p)) throw new Error('목소리 파일이 없거나 바뀌었습니다 — register 를 다시 하세요')
  const missing = v.samples.filter(s => !s.transcript)
  if (missing.length) throw new Error(`녹음에 없는 대사인지 확인하려면 전사문이 필요합니다: ${missing.map(s => basename(s.path)).join(', ')} — set-transcript 또는 transcribe`)
  for (const line of PREVIEW_LINES) {
    // 대사가 녹음 안에 있거나, 녹음의 긴 문장(8자 이상)이 대사 안에 통째로 있으면 새 대사가 아니다. "네" 같은 짧은 녹음은 걸지 않는다.
    const hit = v.samples.find(s => s.transcript && (squash(s.transcript).includes(squash(line.text))
      || (squash(s.transcript).length >= 8 && squash(line.text).includes(squash(s.transcript)))))
    if (hit) throw new Error(`미리 듣기 대사가 녹음에 있습니다(${basename(hit.path)}) — 새 대사가 아닙니다`)
  }
  const dir = join(await ensureWorkdir(), 'previews', v.id)
  await mkdir(dir, { recursive: true })
  const lines = join(dir, 'lines.json')
  await writeFile(lines, JSON.stringify(PREVIEW_LINES))
  const r = await engine<EngineInfo & { device: string; loadMs: number; items: Array<{ kind: string; file: string; ms: number }> }>(['speak', '--voice', p.artifact, '--lines', lines, '--out-dir', dir])
    .catch(async (e: Error) => { v.errors.push({ step: 'preview', at: now(), message: e.message }); await save(reg); throw e })
  const items: NonNullable<Voice['previews']>['items'] = []
  for (const [n, line] of PREVIEW_LINES.entries()) {
    const out = r.items[n]
    if (!out || out.kind !== line.kind) throw new Error('엔진이 대사를 다 읽지 않았습니다')
    const probed = await probe(out.file)
    if (probed.problems.length) throw new Error(`생성된 파일을 오디오로 읽지 못했습니다:\n${describeProbe(probed)}`)
    items.push({ kind: line.kind, text: line.text, file: probed.path, sha256: probed.sha256, latencyMs: out.ms, durationSec: probed.durationSec })
  }
  v.previews = { voiceId: p.voiceId, engine: { engine: r.engine, version: r.version, model: r.model, revision: r.revision }, device: r.device, loadMs: r.loadMs, at: now(), items }
  delete v.review
  await save(reg)
  return v
}

/** 운영자가 미리 듣기 세 개를 직접 듣고 내린 결정. 들은 파일의 해시를 함께 남긴다. */
export async function review(opts: { id: string; decision: 'approved' | 'rejected'; by: string; note?: string }): Promise<Voice> {
  if (!opts.by.trim()) throw new Error('누가 들었는지 적어야 합니다')
  const reg = await load(), v = voiceOf(reg, opts.id)
  if (v.previews?.items.length !== PREVIEW_LINES.length) throw new Error('미리 듣기 세 개가 먼저입니다 (preview)')
  for (const item of v.previews.items) {
    if (!existsSync(item.file) || await sha256File(item.file) !== item.sha256) throw new Error(`미리 듣기 파일이 없거나 바뀌었습니다: ${item.file} — preview 를 다시 하세요`)
  }
  v.review = { decision: opts.decision, by: opts.by.trim(), at: now(), note: opts.note?.trim() ?? '', previewSha256: v.previews.items.map(i => i.sha256) }
  await save(reg)
  return v
}

/* ─────────────── 공식 라이브러리 (DB) ─────────────── */

/** DATABASE_URL 이 운영자가 말한 호스트일 때만 쓴다 — 로컬 .env 가 운영 DB 를 가리킬 수 있다. */
async function library(dbHost: string) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 이 없습니다')
  const host = new URL(url).hostname
  if (host !== dbHost) throw new Error(`DATABASE_URL 호스트(${host})가 --db-host(${dbHost})와 다릅니다`)
  const { db, officialVoices, eq } = await import('../../packages/db/src/index')
  return { db, officialVoices, eq, host }
}

export async function activate(opts: { id: string; dbHost: string }): Promise<Voice> {
  const reg = await load(), v = voiceOf(reg, opts.id)
  const p = v.provider
  if (v.review?.decision !== 'approved') throw new Error('운영자 승인(approve)이 없습니다')
  if (!v.rights) throw new Error('권한 확인 기록이 없습니다')
  if (!p || !await artifactOk(p)) throw new Error('목소리 파일이 없거나 바뀌었습니다 — register 를 다시 하세요')
  if (v.previews?.voiceId !== p.voiceId) throw new Error('승인한 미리 듣기가 지금 목소리 파일로 만든 것이 아닙니다')
  const { db, officialVoices, host } = await library(opts.dbHost)
  const row = {
    label: v.label, provider: 'chatterbox' as const, providerVoiceId: p.voiceId, status: 'active' as const,
    samples: v.samples.map(s => ({ path: s.path, sha256: s.sha256, durationSec: s.durationSec })),
    rights: { ...v.rights },
    approval: { ...v.review, engine: p.engine, reference: { sample: p.reference.sample, sha256: p.reference.sha256 },
      previews: v.previews.items.map(({ kind, text, sha256 }) => ({ kind, text, sha256 })) },
    activatedAt: new Date(), retiredAt: null,
  }
  await db.insert(officialVoices).values({ id: v.id, ...row }).onConflictDoUpdate({ target: officialVoices.id, set: row })
  v.library = { status: 'active', at: now(), dbHost: host }
  await save(reg)
  return v
}

/** 권리 철회 등으로 내린다. 고른 캐릭터는 그때부터 기본 목소리로 돌아간다. 작업 폴더의 파일은 지우지 않는다. */
export async function retire(opts: { id: string; dbHost: string }): Promise<Voice> {
  const reg = await load(), v = voiceOf(reg, opts.id)
  const { db, officialVoices, eq, host } = await library(opts.dbHost)
  const done = await db.update(officialVoices).set({ status: 'retired', retiredAt: new Date() }).where(eq(officialVoices.id, v.id)).returning({ id: officialVoices.id })
  if (!done.length) throw new Error(`라이브러리에 없는 보이스입니다: ${v.id}`)
  v.library = { status: 'retired', at: now(), dbHost: host }
  await save(reg)
  return v
}

/* ─────────────── CLI ─────────────── */

function summary(v: Voice): string {
  const p = v.provider
  return [
    `${v.id} "${v.label}" — 샘플 ${v.samples.length}개 ${v.samples.reduce((s, x) => s + x.durationSec, 0).toFixed(1)}s, 지문 ${v.fingerprint.slice(0, 12)}`,
    ...v.samples.map(s => `  · ${s.path} ${s.durationSec.toFixed(1)}s ${s.channels}ch — 전사문 ${s.transcript ? `${s.transcriptSource}: "${s.transcript.slice(0, 40)}${s.transcript.length > 40 ? '…' : ''}"` : '없음'}${s.notes.length ? ` — 참고: ${s.notes.join(' · ')}` : ''}`),
    `  권한: ${v.rights ? `${v.rights.basis} / ${v.rights.holder} / ${v.rights.evidence} (${v.rights.confirmedBy})` : '미확인'}`,
    `  목소리 파일: ${p ? `${p.voiceId.slice(0, 16)}… (${p.engine.engine} ${p.engine.version} ${p.engine.model}@${p.engine.revision.slice(0, 7)}, ${p.device}) 참조 ${basename(p.reference.sample)} → ${p.reference.clipSec.toFixed(1)}s 클립, 모델 로드 ${p.loadMs}ms · 만들기 ${p.prepareMs}ms` : '미등록'}`,
    ...(v.previews ? [`  미리 듣기 (${v.previews.device}, 모델 로드 ${v.previews.loadMs}ms, 비용 $0 — 로컬)`,
      ...v.previews.items.map(i => `    ${i.kind}: ${i.file} 생성 ${i.latencyMs}ms · ${i.durationSec.toFixed(1)}s "${i.text}"`)] : []),
    `  승인: ${v.review ? `${v.review.decision} (${v.review.by} ${v.review.at})` : '없음'} · 라이브러리: ${v.library ? `${v.library.status} @ ${v.library.dbHost}` : '없음'}`,
    ...v.errors.slice(-3).map(e => `  오류 ${e.at} ${e.step}: ${e.message}`),
  ].join('\n')
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv
  const { values: o, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
    id: { type: 'string' }, label: { type: 'string' }, file: { type: 'string' }, text: { type: 'string' }, reference: { type: 'string' },
    basis: { type: 'string' }, holder: { type: 'string' }, evidence: { type: 'string' }, by: { type: 'string' }, note: { type: 'string' },
    'allow-download': { type: 'boolean' }, 'db-host': { type: 'string' },
  } })
  const id = () => { if (!o.id) throw new Error('--id 가 필요합니다'); return o.id }
  const need = (k: keyof typeof o) => { const val = o[k]; if (typeof val !== 'string' || !val.trim()) throw new Error(`--${k} 가 필요합니다`); return val }
  switch (command) {
    case 'inspect': { const r = await inspect(positionals); console.log(r.map(p => `${describeProbe(p)}\n    전사문: ${p.transcript ? `"${p.transcript.slice(0, 60)}"` : '없음'}`).join('\n') || '오디오 파일이 없습니다'); return }
    case 'fetch': { const r = await fetchWeights(); console.log(`가중치 준비됨: ${r.engine} ${r.version} ${r.model}@${r.revision.slice(0, 7)} — ${r.path} (${r.ms}ms)`); return }
    case 'create': return console.log(summary(await create({ id: id(), label: need('label'), files: positionals })))
    case 'set-transcript': return console.log(summary(await setTranscript({ id: id(), file: need('file'), text: need('text') })))
    case 'transcribe': return console.log(summary(await transcribe({ id: id(), allowDownload: o['allow-download'] === true })))
    case 'confirm-rights': return console.log(summary(await confirmRights({ id: id(), basis: need('basis'), holder: need('holder'), evidence: need('evidence'), by: need('by') })))
    case 'register': return console.log(summary(await register({ id: id(), reference: o.reference })))
    case 'preview': return console.log(summary(await preview({ id: id() })))
    case 'approve': case 'reject': return console.log(summary(await review({ id: id(), decision: command === 'approve' ? 'approved' : 'rejected', by: need('by'), note: o.note })))
    case 'activate': return console.log(summary(await activate({ id: id(), dbHost: need('db-host') })))
    case 'retire': return console.log(summary(await retire({ id: id(), dbHost: need('db-host') })))
    case 'list': {
      const reg = await load()
      console.log(Object.values(reg.voices).map(summary).join('\n\n') || '기록된 보이스가 없습니다')
      console.log(`\n작업 폴더: ${workdir()} · 엔진 ${existsSync(python()) ? '설치됨' : '없음'}(${python()}) · DATABASE_URL ${process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : '없음'}`)
      return
    }
    default: throw new Error('사용법: pnpm voice <inspect|fetch|create|set-transcript|transcribe|confirm-rights|register|preview|approve|reject|activate|retire|list> ...')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(() => process.exit(0), (e: Error) => { console.error(`✗ ${e.message}`); process.exit(1) })
}
