import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/auth'

export const maxDuration = 60
const SAMPLE = '안녕, 오늘 하루는 어땠어? 나는 네 생각하느라 하루가 다 갔어.'

/** 라이브러리 목소리 미리 듣기 — 운영 음성 서버(MIRO_TTS_URL)의 /speak 를 그대로 중계한다. 운영자만. */
export async function GET(req: Request) {
  if (!await currentAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const voice = new URL(req.url).searchParams.get('voice') ?? ''
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(voice)) return NextResponse.json({ error: 'bad voice' }, { status: 400 })
  const base = process.env.MIRO_TTS_URL
  if (!base) return NextResponse.json({ error: 'tts not configured' }, { status: 503 })
  const r = await fetch(`${base.replace(/\/$/, '')}/speak`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MIRO_TTS_API_KEY ?? ''}` },
    body: JSON.stringify({ text: SAMPLE, voice, language: 'ko' }), signal: AbortSignal.timeout(55_000),
  }).catch(() => null)
  if (!r || !r.ok) return NextResponse.json({ error: 'tts failed' }, { status: 502 })
  return new Response(await r.arrayBuffer(), { headers: { 'content-type': 'audio/wav', 'cache-control': 'private, no-store' } })
}
