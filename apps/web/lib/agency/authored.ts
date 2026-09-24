import type { AuthoredDocument, CharacterCore } from '@miro/domain'

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
  add('personality', character.personality)
  add('worldRole', character.worldRole)
  add('appearance', character.appearance)
  add('worldSetting', worldSetting)
  add('worldGenre', worldGenre)
  // Text content is authored; numeric legacy defaults do not become explicit preferences.
  const declared = Object.keys(fields).filter(k => !['personality.jealousy', 'personality.initiative', 'personality.emotionalExpression'].includes(k))
  return { fields, explicitFields: [...new Set([...declared, ...explicitFields.filter(k => k in fields)])].sort() }
}
