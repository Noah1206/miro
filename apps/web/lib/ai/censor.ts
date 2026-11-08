/**
 * 언베일 사진 가림(11/8) — 그림 서버가 만든 사진을 Modal 가림 서버(tooling/image/modal_censor.py)에 보내 성기 부위를 투명 블러로 덮는다.
 * 정보통신망법 44조의7(음란물) 대응이라 실패하면 사진을 내보내지 않는다(호출부가 사용량을 돌려준다).
 * env: MIRO_CENSOR_URL, MIRO_IMAGE_SECRET(그림 서버와 같은 값).
 */
export async function censorPng(png: Buffer): Promise<Buffer> {
  const url = process.env.MIRO_CENSOR_URL
  if (!url || !process.env.MIRO_IMAGE_SECRET) throw new Error('censor_unavailable')
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: process.env.MIRO_IMAGE_SECRET, png: png.toString('base64') }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`censor ${res.status}`)
  const { png: out } = (await res.json()) as { png?: string }
  if (!out) throw new Error('censor_empty')
  return Buffer.from(out, 'base64')
}
