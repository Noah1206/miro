import { ensembleNames } from '@miro/engine'

/**
 * 11/17 작품의 실제 히로인 이름 — 공식 작품은 등록 이름이 작품명·히로인명이 섞여 있다. 화면(말풍선)·알림에 작품명 대신 인물 이름을 쓰려고
 * 설정 글에서 꺼낸다: '[여러 인물]' 첫 인물 → '[히로인] 강세라(28)' → '[숨긴 사정] · 세실리아는' → 소개 '[프로필] 한도은.'. 못 찾으면 null.
 */
export function heroineName(secret: string | null | undefined, intro: string | null | undefined): string | null {
  const s = secret ?? ''
  return ensembleNames(s)[0]
    ?? /\[히로인[^\]]*\][\s·\-—]*([가-힣A-Za-z]{1,12})\s*\(/.exec(s)?.[1]
    ?? /\[숨긴 사정\]\s*·\s*([가-힣]{1,6}?)(?:은|는|이|가|의)\s/.exec(s)?.[1]
    ?? /\[프로필\]\s*([가-힣]{1,6})[.\s]/.exec(intro ?? '')?.[1]
    ?? null
}

/**
 * 작품의 대표 인물 이름 — 공식 작품 설정 글(heroineName) → 사용자가 만든 다인 작품의 첫 인물(만들기 '캐릭터 추가', ensemble_cast) → 등록 이름.
 * 1:1 사용자 작품은 등록 이름이 곧 캐릭터 이름이라 그대로 나온다.
 */
export function leadName(c: { name: string; secret?: string | null; personality?: string | null; cast?: ReadonlyArray<{ name: string }> | null }): string {
  return heroineName(c.secret, c.personality) || c.cast?.find(p => p.name?.trim())?.name.trim() || c.name
}

/** 알림 제목 — 그 연락을 실제로 말한 인물(블록의 화자)이 먼저, 없으면 대표 인물(leadName). */
export function contactSenderName(c: Parameters<typeof leadName>[0], blocks: Array<{ speaker?: string | null }> | null | undefined): string {
  const spoke = blocks?.map(b => b.speaker?.trim()).find(s => s && s !== c.name)
  return spoke || leadName(c)
}

/** 작품의 인물 목록 — 공식 '[여러 인물]' + 만들기 '캐릭터 추가'(ensemble_cast). 문자 답장이 보낸 사람을 고를 때 쓴다(11/17). */
export function castOf(c: { secret?: string | null; ensembleCast?: ReadonlyArray<{ name: string }> | null }): string[] {
  return [...new Set([...ensembleNames(c.secret ?? ''), ...(c.ensembleCast ?? []).map(p => p.name?.trim()).filter(Boolean)])]
}

/** 문자가 누구에게 온 것인지 — 본문에 가장 먼저 나오는 인물 이름(성 뺀 이름도: '서지안' ↔ '지안'). 없으면 null(11/17 다인 작품 문자). */
export function addresseeOf(text: string, cast: readonly string[]): string | null {
  let best: { name: string; at: number } | null = null
  for (const name of cast) {
    for (const alias of [name, ...(/^[가-힣]{3,4}$/.test(name) ? [name.slice(1)] : [])]) {
      const at = text.indexOf(alias)
      if (at >= 0 && (!best || at < best.at)) best = { name, at }
    }
  }
  return best?.name ?? null
}
