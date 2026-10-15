import { expect, it } from 'vitest'
import { characterStorySummary, characterTags } from '../character-card-copy'
it('shows three to five distinct compact tags, even when authored tags are missing', () => {
  expect(characterTags({ relationshipKeywords: [] })).toHaveLength(3)
  const tags = characterTags({ genre: '현대 · 현대', relationshipKeywords: [' #현대 ', '소꿉 친구', '라이벌', '비밀', '재회', '계약'] })
  expect(tags).toHaveLength(5); expect(new Set(tags).size).toBe(5); expect(tags).not.toContain('#현대')
})
it('uses the public starting situation and caps long summaries', () => {
  expect(characterStorySummary({ startingContext: '문이 닫힌 기록실에서 편지를 찾는다. 숨겨진 결말 설명.', tagline: '안녕', relationshipKeywords: [] })).toBe('문이 닫힌 기록실에서 편지를 찾는다.')
  expect(characterStorySummary({ startingContext: '긴 상황 '.repeat(100), relationshipKeywords: [] }).length).toBeLessThanOrEqual(72)
})
