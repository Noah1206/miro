import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, extname, resolve, sep } from 'path'

/**
 * 11/16 사진 저장소 = 운영 서버(맥)의 디스크. Supabase Storage 가 전송량 한도 초과로 통째 막혀(402) 옮겼다 — 돈이 들지 않는 길.
 * 공개 사진은 /media/character-images/<경로> 로 내보내고 Cloudflare 가 캐시한다(주소가 바뀌지 않는 파일이라 1년).
 * ponytail: 서버 한 대의 디스크다 — 서버를 늘리거나 옮기면 이 폴더를 같이 옮기거나 R2 같은 저장소로 바꾼다. 백업은 이 폴더를 따로 챙겨야 한다.
 */
export const PUBLIC_BUCKET = 'character-images'
const root = () => resolve(process.env.MIRO_MEDIA_DIR || resolve(homedir(), 'miro-media'))
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif' }

/** 버킷 안의 파일 경로. 버킷 밖으로 나가는 이름(..)은 null. */
export function mediaPath(bucket: string, name: string): string | null {
  const base = resolve(root(), bucket), path = resolve(base, name)
  return path.startsWith(base + sep) ? path : null
}
export const mediaType = (name: string) => TYPES[extname(name).toLowerCase()] ?? null
export const publicMediaUrl = (name: string) => `/media/${PUBLIC_BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`
/** 우리 공개 사진 주소(/media/character-images/…)면 버킷 안 이름을, 아니면 null. */
export function publicMediaName(url: string): string | null {
  const prefix = `/media/${PUBLIC_BUCKET}/`
  if (!url.startsWith(prefix)) return null
  try { return decodeURIComponent(url.slice(prefix.length).split('?')[0]!) } catch { return null }
}
export async function writeMedia(bucket: string, name: string, bytes: Uint8Array): Promise<void> {
  const path = mediaPath(bucket, name)
  if (!path) throw new Error('media_path_invalid')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: 'wx' })   // 같은 이름을 덮어쓰지 않는다
}
export async function readMedia(bucket: string, name: string): Promise<Buffer | null> {
  const path = mediaPath(bucket, name)
  if (!path) return null
  try { return (await stat(path)).isFile() ? await readFile(path) : null } catch { return null }
}
