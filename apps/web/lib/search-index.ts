import { sql } from 'drizzle-orm'
import { characters, db } from '@miro/db'

export const indexedDiscoveryEnabled = () => process.env.MIRO_FEATURE_INDEXED_DISCOVERY === '1'

export function indexedSearchMatch(needle: string) {
  if (Array.from(needle).length < 3) {
    return sql`${characters.id} IN (
      SELECT character_id FROM miro_perf.character_search_docs
      WHERE short_grams @> ARRAY[${needle}]::text[]
    )`
  }
  const pattern = `%${needle.replace(/[\\%_]/g, '\\$&')}%`
  return sql`${characters.id} IN (
    SELECT character_id FROM miro_perf.character_search_docs
    WHERE search_text LIKE ${pattern} ESCAPE '\\'
  )`
}

export function rankedPopularIds() {
  return db.execute<{ character_id: string; plays: number }>(sql`
    SELECT p.character_id, p.plays
    FROM miro_perf.character_play_counts p
    JOIN public.characters c ON c.id = p.character_id
    WHERE (c.is_official OR c.is_public) AND NOT c.is_draft AND c.deleted_at IS NULL
    ORDER BY p.plays DESC, p.created_at DESC, p.character_id DESC
    LIMIT 6
  `)
}
