/**
 * GPT-SoVITS 목소리를 공식 보이스 라이브러리(official_voices)에 올린다 — 운영자 전용. 프로덕션 코드는 이 파일을 import 하지 않는다.
 *
 *   pnpm voice:gsv register --dir ~/.miro/voices/gsv/voices/<폴더> --id yoon-seoha --label 윤서하 \
 *     --basis own_voice|written_consent|license|unverified --holder "목소리 주인" --evidence "동의 근거" --by <운영자 이메일> --db-host <DATABASE_URL 호스트>
 *   pnpm voice:gsv list   --db-host <host>
 *   pnpm voice:gsv retire --id yoon-seoha --db-host <host>
 *
 * 폴더에는 ref.wav(3~10초)·ref.txt 가 있어야 하고, 파인튜닝했으면 sovits.pth·gpt.ckpt 도 있다(voice_tools.sh install 이 만든 모양).
 * provider_voice_id = sovits.pth 의 sha256(없으면 ref.wav) — 등록하면 폴더를 그 이름으로 옮기고, 음성 서버는 그 이름으로 찾는다.
 */
import { existsSync } from 'node:fs'
import { readFile, rename } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { library, probe, sha256File } from './import'

// unverified(10/20): 권리 근거를 아직 확보하지 못한 목소리 — 거짓 근거 대신 사실대로 남긴다. 공개 전에 바꿔야 한다.
const BASES = ['own_voice', 'written_consent', 'license', 'unverified'] as const

async function main() {
  const { positionals, values: a } = parseArgs({ allowPositionals: true, options: {
    dir: { type: 'string' }, id: { type: 'string' }, label: { type: 'string' }, basis: { type: 'string' }, holder: { type: 'string' },
    evidence: { type: 'string' }, by: { type: 'string' }, 'db-host': { type: 'string' },
  } })
  const cmd = positionals[0]
  if (!a['db-host']) throw new Error('--db-host 가 필요합니다(DATABASE_URL 의 호스트와 같아야 한다)')
  const { db, officialVoices, eq } = await library(a['db-host'])

  if (cmd === 'list') {
    const rows = await db.select().from(officialVoices).orderBy(officialVoices.activatedAt)
    for (const r of rows) console.log(`${r.id}\t${r.label}\t${r.provider}\t${r.status}\t${r.providerVoiceId}`)
    return
  }
  if (cmd === 'retire') {
    if (!a.id) throw new Error('--id 가 필요합니다')
    const done = await db.update(officialVoices).set({ status: 'retired', retiredAt: new Date() }).where(eq(officialVoices.id, a.id)).returning({ id: officialVoices.id })
    if (!done.length) throw new Error(`라이브러리에 없는 보이스: ${a.id}`)
    console.log(`내림: ${a.id} — 고른 캐릭터는 기본 목소리로 돌아간다`)
    return
  }
  if (cmd !== 'register') throw new Error('사용법: register | list | retire')
  for (const k of ['dir', 'id', 'label', 'basis', 'holder', 'evidence', 'by'] as const) if (!a[k]) throw new Error(`--${k} 가 필요합니다`)
  if (!BASES.includes(a.basis as typeof BASES[number])) throw new Error(`--basis 는 ${BASES.join('|')} 중 하나`)
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(a.id!)) throw new Error('--id 는 소문자·숫자·하이픈 2~40자')
  if (a.label!.length > 30) throw new Error('--label 은 30자 이하')

  let dir = resolve(a.dir!.replace(/^~/, process.env.HOME ?? ''))
  const ref = join(dir, 'ref.wav'), refText = join(dir, 'ref.txt'), sovits = join(dir, 'sovits.pth'), gpt = join(dir, 'gpt.ckpt')
  if (!existsSync(ref) || !existsSync(refText)) throw new Error('폴더에 ref.wav 와 ref.txt 가 있어야 합니다')
  const p = await probe(ref)
  if (p.problems.length) throw new Error(`ref.wav: ${p.problems.join('; ')}`)
  if (p.durationSec < 3 || p.durationSec > 10) throw new Error(`ref.wav 는 3~10초여야 합니다(지금 ${p.durationSec.toFixed(1)}초)`)
  const weights = { sovits: existsSync(sovits) ? await sha256File(sovits) : null, gpt: existsSync(gpt) ? await sha256File(gpt) : null }
  const refSha = await sha256File(ref)
  const voiceId = weights.sovits ?? refSha
  // 음성 서버는 provider_voice_id 이름의 폴더를 찾는다 — 폴더 이름을 해시로 맞춘다.
  if (basename(dir) !== voiceId) {
    const target = join(dirname(dir), voiceId)
    if (existsSync(target)) throw new Error(`같은 목소리 폴더가 이미 있습니다: ${target}`)
    await rename(dir, target); dir = target
  }
  const now = new Date()
  const row = {
    label: a.label!, provider: 'gpt-sovits' as const, providerVoiceId: voiceId, status: 'active' as const,
    samples: [{ path: join(dir, 'ref.wav'), sha256: refSha, durationSec: p.durationSec }],
    rights: { basis: a.basis, holder: a.holder!.trim(), evidence: a.evidence!.trim(), confirmedBy: a.by!.trim(), confirmedAt: now.toISOString() },
    approval: { approvedBy: a.by!.trim(), at: now.toISOString(), engine: 'gpt-sovits', version: 'v2', weights,
      reference: { file: 'ref.wav', sha256: refSha, text: (await readFile(join(dir, 'ref.txt'), 'utf8')).trim().slice(0, 300) } },
    activatedAt: now, retiredAt: null,
  }
  await db.insert(officialVoices).values({ id: a.id!, ...row }).onConflictDoUpdate({ target: officialVoices.id, set: row })
  console.log(`등록: ${a.id} (${a.label}) → 폴더 ${dir}\n만들기·편집 화면의 '목소리' 에 바로 보인다. 음성 서버가 이 폴더를 읽으려면 같은 --voices-dir 아래여야 한다.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
