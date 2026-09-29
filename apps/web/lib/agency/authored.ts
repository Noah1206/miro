import { authoredCharacter, type AuthoredDocument, type CharacterCore } from '@miro/domain'

/** Stable field names and exact authored text; no traits inferred from demographic labels. */
export function authoredDocument(character: CharacterCore, worldSetting: string | null, explicitFields: string[] = [], worldGenre?: string | null): AuthoredDocument {
  const fields: Record<string, string> = {}
  function add(key: string, value: unknown) {
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value) && value.some(item => item !== null && typeof item === 'object')) {
      value.forEach((item, index) => add(`${key}.${index}`, item))
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) add(`${key}.${k}`, v)
    } else if (!Array.isArray(value) || value.length) {
      fields[key] = typeof value === 'string' ? value : JSON.stringify(value)
    }
  }
  add('identity', character.identity)
  // 관계 성격표는 AI 가 설정에서 만든 파생 값이다 — 작성자 원문이 아니므로 싣지 않는다(실으면 표가 바뀔 때마다 판이 새로 생긴다).
  add('personality', authoredCharacter(character).personality)
  add('worldRole', character.worldRole)
  add('appearance', character.appearance)
  add('worldSetting', worldSetting)
  add('worldGenre', worldGenre)
  // Text content is authored; numeric legacy defaults do not become explicit preferences.
  const declared = Object.keys(fields).filter(k => !['personality.jealousy', 'personality.initiative', 'personality.emotionalExpression'].includes(k))
  return { fields, explicitFields: [...new Set([...declared, ...explicitFields.filter(k => k in fields)])].sort() }
}
