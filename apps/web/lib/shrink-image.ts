/**
 * 올리기 전에 브라우저에서 사진을 줄인다(10/6) — Vercel 함수는 요청 본문을 4.5MB 까지만 받아서, 원본 여러 장을 그대로 보내면 서버 액션이 413 으로 끊긴다.
 * 긴 변 1600px·JPEG 0.85 로 다시 그린다. 이미 작거나, 브라우저가 못 읽는 형식(HEIC 등)이면 원본 그대로.
 */
const MAX_SIDE = 1600
const SMALL = 700 * 1024

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= SMALL) { bitmap.close(); return file }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff' // 투명 PNG 가 JPEG 에서 검게 되지 않게
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
