import type { characters, characterVisualIdentities, messages } from '@miro/db'
import type { CharacterCore } from '@miro/domain'
import type { RecentMessage } from '@miro/engine'
import { sampleDialogue } from '@/lib/intro-dialogue'

/** One authored identity projection for reply and proactive paths. No inferred demographic traits. */
export function characterContext(
  c: typeof characters.$inferSelect,
  visual?: typeof characterVisualIdentities.$inferSelect | null,
): CharacterCore {
  return {
    id: c.id, ownerId: c.ownerId, isOfficial: c.isOfficial,
    identity: { name: c.name, age: c.age, nationality: c.nationality, occupation: c.occupation, mbti: c.mbti },
    personality: {
      personality: c.personality, values: c.values, speechStyle: c.speechStyle,
      userNickname: c.userNickname, hobbies: c.hobbies, dislikes: c.dislikes,
      jealousy: c.jealousy, initiative: c.initiative, emotionalExpression: c.emotionalExpression,
    },
    worldRole: {
      socialPosition: c.socialPosition, startingContext: c.startingContext,
      sampleDialogue: sampleDialogue(c.sampleDialogue), lore: c.lore,
    },
    visualIdentityId: visual?.id ?? null, contactProfileId: null,
    ...(visual ? { appearance: {
      baseFace: visual.baseFace, bodyProfile: visual.bodyProfile, hair: visual.hair,
      styleTags: visual.styleTags, expressionTendency: visual.expressionTendency, outfitProfile: visual.outfitProfile,
    } } : {}),
  }
}

/** System/moderated messages are never dialogue evidence; narrator knowledge stays separate. */
export function conversationContext(rows: Array<typeof messages.$inferSelect>): RecentMessage[] {
  return rows.filter(m => m.role !== 'system' && !m.hiddenAt).map(m => {
    const blocks = m.blocks.filter((b): b is { type: string; speaker?: string | null; text: string } =>
      ['dialogue', 'action', 'narrative', 'npc', 'world', 'thought'].includes(String(b.type)) && typeof b.text === 'string')
    const speaker = blocks.find(b => b.type === 'npc' && typeof b.speaker === 'string')?.speaker
    return {
      id: m.id, role: m.role as RecentMessage['role'], kind: m.kind,
      content: m.content, at: m.createdAt.toISOString(),
      knowledgeScope: m.role === 'narrator' ? 'omniscient' : 'participant',
      ...(speaker ? { npcName: speaker } : {}),
      ...(blocks.length ? { blocks } : {}),
    }
  })
}
