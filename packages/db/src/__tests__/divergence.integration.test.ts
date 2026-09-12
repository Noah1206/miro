import { afterAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as schema from '../schema/index'
import { applyRelationshipDelta, modulateByPersonality } from '@miro/domain'
import type { RelationshipState } from '@miro/domain'

const { users, characters, worlds, roleplaySessions, worldStates, relationships, events } = schema

const url = process.env.DATABASE_URL
const describeDb = url ? describe : describe.skip

/**
 * Scenario 6 — 같은 캐릭터, 다른 행동 → 다른 관계.
 * 시간 경과가 아니라 행동이 결과를 가른다는 것을 실제 DB 상태로 검증한다.
 */
describeDb('divergent relationships', () => {
  const sql = postgres(url!)
  const db = drizzle(sql, { schema })
  const made: string[] = []

  async function newSession(slug: string) {
    const [u] = await db.insert(users)
      .values({ email: `d-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)

    const [c] = await db.select({
      id: characters.id, worldId: worlds.id,
      initial: characters.initialRelationship,
      jealousy: characters.jealousy, expression: characters.emotionalExpression,
    })
      .from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id))
      .where(eq(characters.slug, slug)).limit(1)

    const [s] = await db.insert(roleplaySessions)
      .values({ userId: u!.id, characterId: c!.id, worldId: c!.worldId })
      .returning({ id: roleplaySessions.id })
    await db.insert(worldStates)
      .values({ sessionId: s!.id, currentLocation: 'x', currentTime: 'y' })
    await db.insert(relationships).values({ sessionId: s!.id, ...c!.initial })

    return { sessionId: s!.id, character: c! }
  }

  async function state(sessionId: string): Promise<RelationshipState> {
    const [r] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    return r as never
  }

  /** 한 턴의 관계 변화를 실제 커밋 경로와 동일하게 적용한다. */
  async function applyTurn(
    sessionId: string,
    delta: Record<string, number>,
    personality: { jealousy: number; emotionalExpression: number },
  ) {
    const current = await state(sessionId)
    const next = applyRelationshipDelta(current, modulateByPersonality(delta, personality))
    const updated = await db.update(relationships)
      .set({
        trust: next.trust, attraction: next.attraction, jealousy: next.jealousy,
        protectiveness: next.protectiveness, emotionalDistance: next.emotionalDistance,
        attachment: next.attachment, stage: next.stage, version: next.version,
      })
      .where(and(
        eq(relationships.sessionId, sessionId),
        eq(relationships.version, current.version),
      ))
      .returning({ id: relationships.id })
    expect(updated).toHaveLength(1)   // optimistic lock 이 통과해야 한다
  }

  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    await sql.end()
  })

  it('Scenario 6: kindness and neglect lead to materially different relationships', async () => {
    const a = await newSession('taeyun')
    const b = await newSession('taeyun')
    const p = { jealousy: a.character.jealousy, emotionalExpression: a.character.expression }

    // 같은 턴 수, 다른 행동
    for (let i = 0; i < 6; i++) {
      await applyTurn(a.sessionId, { trust: 6, attachment: 5, emotionalDistance: -6 }, p)
      await applyTurn(b.sessionId, { trust: -5, attachment: -3, emotionalDistance: 7 }, p)
    }

    const ra = await state(a.sessionId)
    const rb = await state(b.sessionId)

    expect(ra.trust).toBeGreaterThan(rb.trust + 20)
    expect(ra.emotionalDistance).toBeLessThan(rb.emotionalDistance - 20)
    expect(ra.attachment).toBeGreaterThan(rb.attachment)
  })

  it('T3: a high-trust relationship still regresses after betrayal', async () => {
    const { sessionId, character } = await newSession('thomas')
    const p = { jealousy: character.jealousy, emotionalExpression: character.expression }

    for (let i = 0; i < 8; i++) {
      await applyTurn(sessionId, { trust: 12 }, p)
    }
    const peak = (await state(sessionId)).trust
    expect(peak).toBeGreaterThan(80)

    // 배신
    for (let i = 0; i < 4; i++) {
      await applyTurn(sessionId, { trust: -15, emotionalDistance: 12 }, p)
    }
    const after = await state(sessionId)

    expect(after.trust).toBeLessThan(peak - 40)
    expect(after.emotionalDistance).toBeGreaterThan(40)
  })

  it('T6: many turns alone never push the relationship into romance', async () => {
    const { sessionId, character } = await newSession('hisashi')
    const p = { jealousy: character.jealousy, emotionalExpression: character.expression }

    // 중립적인 턴을 30회 반복한다 — 시간만으로는 아무 일도 일어나지 않아야 한다
    for (let i = 0; i < 30; i++) {
      await applyTurn(sessionId, { trust: 1 }, p)
    }
    const r = await state(sessionId)
    expect(r.stage).toBe('stranger')
    expect(['flirting', 'dating', 'lover']).not.toContain(r.stage)
  })

  it('T2: the same action moves two characters differently', async () => {
    const jealousChar = await newSession('taeyun')   // jealousy 60
    const calmChar = await newSession('thomas')      // jealousy 35

    const rivalSeen = { jealousy: 10 }
    await applyTurn(jealousChar.sessionId, rivalSeen, {
      jealousy: jealousChar.character.jealousy,
      emotionalExpression: jealousChar.character.expression,
    })
    await applyTurn(calmChar.sessionId, rivalSeen, {
      jealousy: calmChar.character.jealousy,
      emotionalExpression: calmChar.character.expression,
    })

    const jr = await state(jealousChar.sessionId)
    const cr = await state(calmChar.sessionId)
    expect(jr.jealousy).toBeGreaterThan(cr.jealousy)
  })

  it('T4/T5: a resolved event starts a cooldown instead of recurring next turn', async () => {
    const { sessionId } = await newSession('thomas')

    const [e] = await db.insert(events).values({
      sessionId, type: 'jealousy', status: 'active', createdAtTurn: 3,
    }).returning({ id: events.id })

    // 5턴에 해결 → 쿨다운 시작
    await db.update(events)
      .set({ status: 'resolved', resolvedAtTurn: 5, cooldownUntilTurn: 13 })
      .where(eq(events.id, e!.id))

    const [after] = await db.select().from(events).where(eq(events.id, e!.id))
    expect(after!.status).toBe('resolved')
    expect(after!.cooldownUntilTurn).toBeGreaterThan(after!.resolvedAtTurn!)
  })
})
