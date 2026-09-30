import { sql, type SQL } from 'drizzle-orm'
import { db } from '@miro/db'

export const indexedDiscoveryEnabled = () => process.env.MIRO_FEATURE_INDEXED_DISCOVERY === '1'

/** 대화한 사람 수 순서로 6명. `filter` 는 characters 를 `c` 로 부르는 조건이다 — 홈 장르 칩이 건다. */
export function rankedPopularIds(filter?: SQL) {
  return db.execute<{ character_id: string; plays: number }>(sql`
    SELECT p.character_id, p.plays
    FROM miro_perf.character_play_counts p
    JOIN public.characters c ON c.id = p.character_id
    WHERE (c.is_official OR c.is_public) AND NOT c.is_draft AND c.deleted_at IS NULL${filter ? sql` AND ${filter}` : sql``}
    ORDER BY p.plays DESC, p.created_at DESC, p.character_id DESC
    LIMIT 6
  `)
}
