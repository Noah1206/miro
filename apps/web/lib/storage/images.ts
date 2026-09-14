import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

/**
 * 캐릭터 사진 업로드 — Supabase Storage 의 `character-images` 버킷(공개 읽기).
 * 서비스 롤 키로만 쓴다. 클라이언트가 직접 올리지 않는다 — 크기·형식 검증을 여기서 한다.
 */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_BYTES = 5 * 1024 * 1024
const BUCKET = 'character-images'

let client: ReturnType<typeof createClient> | null = null
function storageClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  client ??= createClient(url, key, { auth: { persistSession: false } })
  return client
}

export type UploadResult = { ok: true; url: string } | { ok: false; error: string }

/** 파일 하나를 올리고 공개 URL을 돌려준다. 저장소가 설정되지 않았으면 명확히 실패한다 — 조용히 무시하지 않는다. */
export async function uploadCharacterImage(file: File, ownerId: string): Promise<UploadResult> {
  if (!ALLOWED.has(file.type)) return { ok: false, error: '지원하지 않는 이미지 형식이에요.' }
  if (file.size > MAX_BYTES) return { ok: false, error: '5MB 이하 사진만 올릴 수 있어요.' }

  const supabase = storageClient()
  if (!supabase) return { ok: false, error: '이미지 저장소가 설정되지 않았어요.' }

  const ext = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const path = `${ownerId}/${randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false })
  if (error) return { ok: false, error: '사진을 올리지 못했어요.' }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { ok: true, url: data.publicUrl }
}

/** 여러 장을 순서대로 올린다. 실패한 파일은 건너뛰고 이유를 함께 돌려준다 — 하나가 실패해도 나머지는 저장된다. */
export async function uploadCharacterImages(files: File[], ownerId: string): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = []
  const errors: string[] = []
  for (const file of files) {
    const r = await uploadCharacterImage(file, ownerId)
    if (r.ok) urls.push(r.url)
    else errors.push(r.error)
  }
  return { urls, errors }
}

/**
 * 만들기·편집 폼(FormInitial 의 ImagePicker)에서 온 사진 필드를 최종 URL 배열로 합친다.
 * 새 파일(images)은 업로드하고, 유지한 기존 URL(keptImages)은 그대로 두되, imageOrder(대표부터의
 * 'existing'|'new' 토큰 순서)로 둘을 합친다 — 화면에서 기존·새 사진을 드래그로 섞을 수 있어서 필요하다.
 */
export async function resolveCharacterImages(form: FormData, ownerId: string): Promise<string[]> {
  const newFiles = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
  const keptImages = form.getAll('keptImages').filter((v): v is string => typeof v === 'string')
  const order = form.getAll('imageOrder').filter((v): v is string => typeof v === 'string')
  const { urls: uploadedUrls, errors } = newFiles.length > 0
    ? await uploadCharacterImages(newFiles, ownerId)
    : { urls: [], errors: [] }
  if (errors.length > 0) throw new Error(`IMAGE_UPLOAD_FAILED: ${errors.join(', ')}`)

  let keptIdx = 0
  let newIdx = 0
  return (order.length > 0
    ? order.map((kind) => (kind === 'existing' ? keptImages[keptIdx++] : uploadedUrls[newIdx++]))
    : [...keptImages, ...uploadedUrls]
  ).filter((u): u is string => Boolean(u)).slice(0, 5)
}
