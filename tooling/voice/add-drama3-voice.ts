/**
 * 녹음 파일 하나로 Drama 3 공식 목소리를 등록한다(11/3) — 운영자 전용. 학습 없이 참조 녹음으로 바로 말한다(제로샷).
 * 음성 서버의 /voices 창구(5~30초, 읽은 문장과 받아쓰기 대조 CER ≤ 0.3, 너무 작거나 찢어진 소리 거절)를 그대로 쓰고,
 * 통과하면 official_voices 에 active 로 올린다 — 만들기·편집 화면 '목소리'에 바로 보인다.
 *
 *   DATABASE_URL=<운영 DIRECT_DATABASE_URL> pnpm voice:add --file 녹음.m4a --text "녹음에서 읽은 문장 그대로" \
 *     --id m-2 --label "도윤 · 남성 20대 낮은 톤" --basis own_voice --holder "목소리 주인" --evidence "본인 녹음·서면 동의" \
 *     --by ab40905045@gmail.com --db-host <DATABASE_URL 호스트> [--adult] [--start 200]
 *
 * --text 를 빼면(11/3 사용자: "녹음 파일만 주면 클로닝") 아무 내용의 녹음이든 앞뒤 무음을 자르고 말이 있는 25초를 골라
 * Gemini 로 받아쓴 뒤 그 문장으로 등록한다(길이 자유, m4a·mp3·wav 다 됨). 대본(VOICE_SCRIPTS)은 새로 녹음할 때만 참고.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseEnv } from 'node:util'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { library } from './import'

export const VOICE_SCRIPTS = [
  '오늘 하루는 어땠어? 나는 아침부터 비가 와서 좀 처졌는데, 네 문자 보고 기분이 좀 나아졌어. 이따 시간 되면 잠깐 통화할래?',
  '늦었네. 기다리느라 커피만 두 잔 마셨어. 괜찮아, 화난 거 아니야. 그냥 네 얼굴 보니까 이제야 좀 안심이 된다.',
  '이리 와 봐. 손이 왜 이렇게 차가워? 감기 걸리면 어쩌려고 그래. 내 겉옷 걸치고, 오늘은 내가 집까지 데려다줄게.',
]

const DEFAULT_UPLOAD_URL = 'https://ab40905045--miro-drama3-tts-voices-api.us-east.modal.run'

async function main() {
  const { values: a } = parseArgs({ options: {
    file: { type: 'string' }, text: { type: 'string' }, id: { type: 'string' }, label: { type: 'string' },
    basis: { type: 'string' }, holder: { type: 'string' }, evidence: { type: 'string' }, by: { type: 'string' },
    'db-host': { type: 'string' }, adult: { type: 'boolean', default: false }, 'upload-url': { type: 'string' }, start: { type: 'string' },
  } })
  for (const k of ['file', 'id', 'label', 'basis', 'holder', 'evidence', 'by', 'db-host'] as const) if (!a[k]?.trim()) throw new Error(`--${k} 가 필요합니다`)
  if (!['own_voice', 'written_consent', 'license'].includes(a.basis!)) throw new Error('--basis 는 own_voice|written_consent|license')
  if (!/^[a-z0-9-]{2,40}$/.test(a.id!)) throw new Error('--id 는 소문자·숫자·- 만(예: m-2, f-1)')
  const { db, officialVoices } = await library(a['db-host']!)
  const url = (a['upload-url'] ?? process.env.MIRO_VOICE_UPLOAD_URL ?? DEFAULT_UPLOAD_URL).replace(/\/$/, '')
  const key = process.env.MIRO_TTS_API_KEY ?? (await readFile(join(homedir(), '.miro/voices/gsv/modal-tts-api-key.txt'), 'utf8')).trim()
  // 앞뒤 무음을 자르고 25초까지만, 44.1kHz 모노 wav — 서버의 5~30초·3MB 조건에 맞춘다.
  const dir = mkdtempSync(join(tmpdir(), 'voice-add-')), clip = join(dir, 'clip.wav')
  // --start 초(11/3) — 긴 녹음에서 배경음 없이 또렷한 구간부터 쓴다(없으면 처음부터).
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...(a.start ? ['-ss', String(Number(a.start) || 0)] : []), '-i', a.file!, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3,areverse,loudnorm=I=-20:TP=-2',
    '-t', '25', '-ac', '1', '-ar', '44100', clip])
  const audio = await readFile(clip)
  const text = a.text?.trim() || await transcribe(audio)
  console.log(`받아쓴 문장: ${text}`)
  console.log('음성 서버에 올리는 중… (꺼져 있으면 30초 정도 걸려요)')
  const res = await fetch(`${url}/voices`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ audio: audio.toString('base64'), text }), signal: AbortSignal.timeout(180_000) })
  const out = await res.json().catch(() => null) as { id?: string; seconds?: number; cer?: number; error?: string } | null
  if (!res.ok || !out?.id) throw new Error(`음성 서버가 거절: ${res.status} ${JSON.stringify(out)} (length=5~30초, quiet=너무 작음, clipped=소리 찢어짐, mismatch=읽은 문장이 다름)`)
  const now = new Date()
  const row = {
    label: a.label!.trim(), provider: 'drama3' as const, providerVoiceId: out.id, status: 'active' as const, ownerId: null, shared: false, adultAllowed: a.adult!,
    samples: [{ path: `modal:miro-user-voices/${out.id}/ref.wav`, sha256: out.id, durationSec: out.seconds ?? 0 }],
    rights: { basis: a.basis, holder: a.holder!.trim(), evidence: a.evidence!.trim(), confirmedBy: a.by!.trim(), confirmedAt: now.toISOString() },
    approval: { approvedBy: a.by!.trim(), at: now.toISOString(), engine: 'drama3', reference: { text: text.slice(0, 300), cer: out.cer } },
    activatedAt: now, retiredAt: null,
  }
  await db.insert(officialVoices).values({ id: a.id!, ...row }).onConflictDoUpdate({ target: officialVoices.id, set: row })
  console.log(`등록: ${a.id} (${a.label}) · ${out.seconds}초 · 받아쓰기 차이 ${out.cer} → 만들기·편집 화면 '목소리'에 바로 보입니다.`)
}

/** 녹음 → 그대로 받아쓰기(Gemini). 고치거나 다듬지 않는다 — 서버가 받아쓰기와 다시 대조한다. */
async function transcribe(wav: Buffer): Promise<string> {
  const key = process.env.GEMINI_API_KEY ?? parseEnv(await readFile(join(process.cwd(), '.env'), 'utf8')).GEMINI_API_KEY
  if (!key) throw new Error('받아쓰기용 GEMINI_API_KEY 가 없습니다 — --text 로 직접 적어 주세요')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'audio/wav', data: wav.toString('base64') } },
      { text: '이 한국어 음성을 들리는 그대로 받아써 주세요. 고치거나 요약하지 말고, 문장 부호만 붙여 한 줄로. 다른 말은 쓰지 마세요.' }] }] }) })
  const out = await res.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null
  const text = out?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('').trim()
  if (!res.ok || !text) throw new Error(`받아쓰기 실패: ${res.status}`)
  return text.slice(0, 300)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
