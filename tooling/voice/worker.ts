/**
 * 목소리 만들기 워커(10/20) — 관리자 콘솔 /voices 가 건 voice_jobs 를 이 맥북에서 하나씩 끝까지 돌린다.
 *   유튜브 다운로드·슬라이스·전사(miro_pipeline_master.py) → 파인튜닝(train_miro.py, CPU) → 설치(목소리 폴더) → 등록(register-gsv.ts)
 * 실행: cd ~/Desktop/Miro && DATABASE_URL=… pnpm voice:worker      (mac-server.sh 가 같이 띄운다)
 * 단계마다 voice_jobs.stage·log 를 갱신해 화면에 보인다. 실패하면 status=failed·error 에 마지막 줄.
 *
 * ponytail: 한 번에 한 작업, 재시도 없음, 학습은 로컬 CPU(목소리당 1~2시간). GPU 호스트가 생기면 train 단계만 바꾼다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const HOME = process.env.HOME ?? ''
const GSV = process.env.GSV_ROOT ?? join(HOME, 'GPT-SoVITS')
const PY = join(GSV, 'venv/bin/python')
const VOICES = process.env.MIRO_VOICES_DIR ?? join(HOME, '.miro/voices/gsv/voices')
const REPO = process.cwd()  // pnpm voice:worker 는 저장소 루트에서 돈다
const FFPROBE = '/opt/homebrew/bin/ffprobe'
const POLL_MS = 15_000

type Job = { id: string; voiceId: string; label: string; sourceUrls: string[]; rights: { basis: string; holder: string; evidence: string }; requestedBy: string }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 이 없습니다')
  const dbHost = new URL(process.env.DATABASE_URL).hostname
  const { db, voiceJobs, and, asc, eq, sql } = await import('../../packages/db/src/index')
  console.log(`voice worker: db=${dbHost} gsv=${GSV} voices=${VOICES}`)
  // 워커가 죽었다 다시 뜨면 'running' 으로 남은 작업은 처음부터 다시(워커는 하나뿐이라는 전제)
  await db.update(voiceJobs).set({ status: 'queued', stage: '', error: null }).where(and(eq(voiceJobs.status, 'running'), sql`${voiceJobs.stage} not like '2/4 학습 대기%'`))
  const TRAINER = process.env.MIRO_TRAINER ?? 'local'  // local = 맥 CPU(1~2시간) | colab = 데이터셋만 만들고 jobs/<id>/weights/ 에 가중치가 올 때까지 기다림
  console.log(`trainer=${TRAINER}`)

  const log = async (id: string, line: string) => {
    console.log(`[${id.slice(0, 8)}] ${line}`)
    await db.update(voiceJobs).set({ log: sql`right(${voiceJobs.log} || ${line + '\n'}, 60000)` }).where(eq(voiceJobs.id, id))
  }
  const stage = async (id: string, s: string) => { await db.update(voiceJobs).set({ stage: s }).where(eq(voiceJobs.id, id)); await log(id, `── ${s}`) }

  /** 긴 명령을 돌리며 고른 줄만 로그로. 실패하면 마지막 줄을 담아 throw. */
  const run = (id: string, cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; keep: RegExp }) => new Promise<void>((ok, fail) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } })
    let tail = ''; let buf = ''
    const onData = (d: Buffer) => {
      buf += d.toString(); const lines = buf.split(/\r?\n/); buf = lines.pop() ?? ''
      for (const l of lines) { if (!l.trim()) continue; tail = l; if (opts.keep.test(l)) void log(id, l.slice(0, 300)) }
    }
    p.stdout.on('data', onData); p.stderr.on('data', onData)
    p.on('close', (code) => code === 0 ? ok() : fail(new Error(`${cmd} 종료 코드 ${code}: ${tail.slice(0, 300)}`)))
  })

  const dur = (wav: string) => parseFloat(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).stdout) || 0
  const newest = (dir: string, re: RegExp) => readdirSync(dir).filter((f) => re.test(f)).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]

  const paths = (job: Job) => {
    const exp = job.voiceId.replace(/-/g, '_'), jobDir = join(GSV, 'jobs', job.voiceId)
    return { exp, jobDir, list: join(jobDir, 'raw_manhwa_voice.list'), wavs: join(jobDir, 'Miro_Dataset_Output'), weights: join(jobDir, 'weights') }
  }
  const readLines = (list: string) => readFileSync(list, 'utf8').split('\n').filter((l) => l.split('|').length === 4 && /[가-힣]{2,}/.test(l.split('|')[3] ?? ''))

  /** 1단계: 유튜브 → 데이터셋. colab 모드면 zip 만 두고 '학습 대기'로 돌려보낸다(다음 작업을 막지 않게). local 모드면 학습까지. */
  async function prepare(job: Job): Promise<'waiting' | 'trained'> {
    const { exp, jobDir, list, wavs } = paths(job); mkdirSync(jobDir, { recursive: true })
    await stage(job.id, '1/4 유튜브 다운로드 · 슬라이스 · 전사')
    await run(job.id, PY, ['-u', join(GSV, 'miro_pipeline_master.py')], { cwd: jobDir, keep: /^(📥|🎙️|✂️|✨|❌|⚠️)|완료|오류/,
      env: { MIRO_YOUTUBE_URLS: job.sourceUrls.join(','), MIRO_VOICE_NAME: exp, MIRO_WHISPER: process.env.MIRO_WHISPER ?? 'small' } })
    // 전사 정리: 칸이 4개가 아니거나(글자에 | 가 섞임) 한글이 없는 줄(Whisper 환각)은 뺀다
    const lines = readLines(list)
    // 10개 미만이면 학습 자체가 안 되고, 10~40개는 되긴 하지만 음색이 흔들린다(10/20 겨우디 13개) — 막지 않고 경고만 남긴다
    if (lines.length < 10) throw new Error(`쓸 수 있는 조각이 ${lines.length}개뿐입니다(최소 10). 배경음이 적고 말이 많은 영상으로 다시.`)
    writeFileSync(list, lines.join('\n') + '\n')
    await log(job.id, `조각 ${lines.length}개로 학습${lines.length < 40 ? ' — 40개 미만이라 품질이 낮을 수 있음(영상을 더 넣으면 좋아짐)' : ''}`)
    if (TRAINER === 'colab') {
      spawnSync('zip', ['-q', '-r', `${jobDir}.zip`, 'Miro_Dataset_Output', 'raw_manhwa_voice.list'], { cwd: jobDir })
      await stage(job.id, `2/4 학습 대기 — Colab 에서 가중치를 넣어 주면 이어짐 (${jobDir}.zip)`)
      return 'waiting'
    }
    await stage(job.id, '2/4 파인튜닝(CPU, 1~2시간)')
    await run(job.id, PY, ['-u', join(GSV, 'train_miro.py')], { cwd: GSV, keep: /^(STEP|DATA|WEIGHTS|ALL)|====> Epoch|Traceback|Error/,
      env: { GSV_ROOT: GSV, GSV_EXP: exp, GSV_LIST: list, GSV_WAVS: wavs, GSV_GPU: process.env.GSV_GPU ?? '0', NLTK_ALLOW_PROXIED_URLOPEN: '1' } })
    return 'trained'
  }

  /** 3·4단계: 가중치 → 목소리 폴더 → 라이브러리 등록. 가중치는 jobs/<id>/weights/ 또는 로컬 학습 산출물. */
  async function finish(job: Job) {
    const { exp, list, weights } = paths(job)
    const lines = readLines(list)
    let sov = join(weights, 'sovits.pth'), gpt = join(weights, 'gpt.ckpt')
    if (!existsSync(sov) || !existsSync(gpt)) {
      sov = newest(join(GSV, 'SoVITS_weights_v2'), new RegExp(`^${exp}_e\\d+_s\\d+\\.pth$`)) ?? ''
      gpt = newest(join(GSV, 'GPT_weights_v2'), new RegExp(`^${exp}-e\\d+\\.ckpt$`)) ?? ''
    }
    await stage(job.id, '3/4 설치(목소리 폴더)')
    if (!sov || !gpt) throw new Error('학습 결과 가중치를 찾지 못했습니다')
    const dir = join(VOICES, exp); mkdirSync(dir, { recursive: true })
    copyFileSync(sov, join(dir, 'sovits.pth')); copyFileSync(gpt, join(dir, 'gpt.ckpt'))
    // 참조 3~10초: 5~8초 조각을 먼저, 없으면 3~10초 아무거나
    const refs = lines.map((l) => ({ wav: l.split('|')[0] ?? '', text: l.split('|')[3] ?? '' })).map((r) => ({ ...r, d: dur(r.wav) }))
    const ref = refs.find((r) => r.d >= 5 && r.d <= 8) ?? refs.find((r) => r.d >= 3 && r.d <= 10)
    if (!ref) throw new Error('3~10초 참조 조각이 없습니다')
    copyFileSync(ref.wav, join(dir, 'ref.wav')); writeFileSync(join(dir, 'ref.txt'), ref.text)
    await log(job.id, `참조 ${ref.d.toFixed(1)}초: ${ref.text}`)

    await stage(job.id, '4/4 라이브러리 등록')
    const holder = job.rights.holder || `유튜브 ${job.sourceUrls.join(' ')}`
    const evidence = `${job.rights.evidence ? job.rights.evidence + ' — ' : ''}유튜브 ${job.sourceUrls.join(', ')} 로 ${new Date().toISOString().slice(0, 10)} 파인튜닝(GPT-SoVITS v2, 기본 에폭, 조각 ${lines.length}개). 작업 ${job.id}`
    const r = spawnSync('pnpm', ['-s', 'voice:gsv', 'register', '--dir', dir, '--id', job.voiceId, '--label', job.label, '--basis', job.rights.basis,
      '--holder', holder, '--evidence', evidence, '--by', job.requestedBy, '--db-host', dbHost], { cwd: REPO, encoding: 'utf8', env: process.env })
    if (r.status !== 0) throw new Error(`등록 실패: ${(r.stderr || r.stdout).trim().slice(-300)}`)
    await log(job.id, r.stdout.trim().split('\n')[0] ?? '')
    await db.update(voiceJobs).set({ status: 'done', stage: '끝 — 제작기 목소리 목록에 보임', finishedAt: new Date() }).where(eq(voiceJobs.id, job.id))
  }

  const failJob = async (id: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    await log(id, `실패: ${msg}`)
    await db.update(voiceJobs).set({ status: 'failed', error: msg.slice(0, 500), finishedAt: new Date() }).where(eq(voiceJobs.id, id))
  }

  for (;;) {
    // (a) 학습 대기 중인 작업에 가중치가 들어왔으면 마무리한다 — 다른 작업과 상관없이
    const waiting = await db.select().from(voiceJobs).where(and(eq(voiceJobs.status, 'running'), sql`${voiceJobs.stage} like '2/4 학습 대기%'`))
    for (const w of waiting as Job[]) {
      const { weights } = paths(w)
      if (!(existsSync(join(weights, 'sovits.pth')) && existsSync(join(weights, 'gpt.ckpt')))) continue
      await new Promise((r) => setTimeout(r, 5_000))  // 복사가 끝나길
      try { await finish(w) } catch (e) { await failJob(w.id, e) }
    }
    // (b) 새 작업 하나
    const [job] = await db.select().from(voiceJobs).where(eq(voiceJobs.status, 'queued')).orderBy(asc(voiceJobs.createdAt)).limit(1)
    if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue }
    // 조건부 UPDATE 로 집는다 — 워커가 둘 떠도 같은 작업을 두 번 돌리지 않게
    const took = await db.update(voiceJobs).set({ status: 'running', startedAt: new Date() }).where(and(eq(voiceJobs.id, job.id), eq(voiceJobs.status, 'queued'))).returning({ id: voiceJobs.id })
    if (!took.length) continue
    try {
      const r = await prepare(job as Job)
      if (r === 'trained') await finish(job as Job)
    } catch (e) { await failJob(job.id, e) }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
