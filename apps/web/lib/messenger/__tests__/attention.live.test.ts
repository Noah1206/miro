import { randomUUID } from 'node:crypto'
import { writeFile, readFile, open, unlink } from 'node:fs/promises'
import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, userSettings, characters, worlds, contactProfiles, roleplaySessions, relationships, worldStates, messages,
  characterRevisions, characterRuntimeStates, messengerInbox } from '@miro/db'
import { createAgencyState, type CompiledCharacter } from '@miro/domain'
import { hashAuthoredCharacter } from '@miro/engine'
import * as providers from '@miro/providers'
import * as usage from '@/lib/usage/ai-usage'
import { authoredDocument } from '@/lib/agency/authored'
import { loadSession } from '@/lib/simulation/snapshot'
import { receiveMessenger, runMessengerInbox } from '../inbox'
import { ATTENTION_VERSION } from '../attention'
import { testDatabaseUrl } from '../../../../../tooling/test-database'
import { SEEDS } from '../../../scripts/bl-characters.data.mjs'
import { SEEDS_2 } from '../../../scripts/bl-characters-2.data.mjs'

const OUT = process.env.MIRO_ATTENTION_EVAL_OUT
vi.mock('@/lib/defer', () => ({ afterResponse: async () => {} }))
const WARM = '솔직하고 다정하다. 신뢰하는 상대의 일상이 궁금하고 먼저 관심을 표현한다. 상대의 연락을 반가워한다. 낯선 상대에게는 예의를 지키며 천천히 관계를 알아간다.'
const RESERVED = '타인에게 쉽게 마음을 열지 않으며 연락에 즉시 반응하는 것을 부담스러워한다. 사적인 시간과 경계를 소중히 여긴다. 갈등 뒤에는 감정을 가라앉힐 공간이 필요하다. 다만 오래 신뢰한 사람과의 관계는 책임 있게 지키려 한다.'
type Case = { label: string; personality: string; secret?: string; values?: string; name?: string; occupation?: string; world?: string;
  relationship: 'close' | 'distant' | 'conflict'; mood: 'calm' | 'hurt'; availability: 'free' | 'busy'; allowed: string[] }
const cases: Case[] = [
  { label: 'warm_close', personality: WARM, relationship: 'close', mood: 'calm', availability: 'free', allowed: ['read'] },
  { label: 'warm_distant', personality: WARM, relationship: 'distant', mood: 'calm', availability: 'free', allowed: ['read','defer'] },
  { label: 'reserved_close', personality: RESERVED, relationship: 'close', mood: 'calm', availability: 'free', allowed: ['read','defer'] },
  { label: 'reserved_distant', personality: RESERVED, relationship: 'distant', mood: 'calm', availability: 'free', allowed: ['defer','leave_unread'] },
  { label: 'reserved_conflict', personality: RESERVED, relationship: 'conflict', mood: 'hurt', availability: 'free', allowed: ['defer','leave_unread'] },
  { label: 'warm_busy', personality: WARM, relationship: 'close', mood: 'calm', availability: 'busy', allowed: ['read','defer'] },
]
cases.push({ label:'reserved_close_hurt', personality:RESERVED, relationship:'close', mood:'hurt', availability:'free', allowed:['read','defer','leave_unread'] },
  { label:'reserved_distant_hurt', personality:RESERVED, relationship:'distant', mood:'hurt', availability:'free', allowed:['defer','leave_unread'] })
for (const slug of ['official-seo-ian','official-cha-dogyeom','official-gu-manseok']) {
  const canon = [...SEEDS, ...SEEDS_2].find(item => item.slug === slug)!
  for (const relation of ['close','conflict'] as const) cases.push({ label: `${canon.name}_${relation}`, name: canon.name,
    personality: canon.personality, secret: canon.secret, values: canon.values, occupation: canon.occupation, world: canon.world.worldSetting,
    relationship: relation, mood: relation === 'conflict' ? 'hurt' : 'calm', availability: 'free',
    allowed: canon.name === '구만석' ? ['defer','leave_unread'] : relation === 'close' ? ['read','defer'] : ['read','defer','leave_unread'] })
}

const labels=process.env.MIRO_ATTENTION_EVAL_LABELS?.split(',')
const selectedCases=labels ? cases.filter(item=>labels.includes(item.label)) : cases

describe.skipIf(!OUT)('live messenger attention — production model, isolated app path', () => {
  it('measures personality, relationship, affect, situation and unread isolation', async () => {
    if (!testDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Local test database required')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE','live'); vi.stubEnv('MIRO_AGENCY_DEFAULT_POLICY','agency:v1')
    vi.stubEnv('MIRO_FEATURE_CHARACTER_LIFE','0')
    const records: providers.AIUsageRecord[] = [], rows: Record<string, unknown>[] = []
    const reservedPath = process.env.MIRO_ATTENTION_EVAL_BUDGET_PATH ?? '/tmp/miro-attention-live-results.json.budget.json', limitUSD = 3
    let reservedUSD = 0, attempts = 0
    try { const previous=JSON.parse(await readFile(reservedPath,'utf8')); if(!Number.isFinite(previous.reservedUSD)||previous.reservedUSD<0||!Number.isSafeInteger(previous.attempts)||previous.attempts<0)throw new Error('Invalid persistent validation budget'); reservedUSD=previous.reservedUSD; attempts=previous.attempts } catch(error) { if((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const lock=await open(reservedPath+'.lock','wx',0o600)
    const guard: providers.BudgetGuard = { async authorize(request, model, _context, id) {
      const cost = providers.modelCost(model, Buffer.byteLength(request.system + request.prompt) + 512, request.maxTokens ?? model.maxOutputTokens)
      if (cost === null) return { allowed:false, reason:'unknown_price' }
      const ceiling = Math.max(.01, Math.ceil(cost * 1.5 * 1e8) / 1e8)
      if (reservedUSD + ceiling > limitUSD || attempts >= 60) return { allowed:false, reason:'validation_total_limit' }
      reservedUSD += ceiling; attempts++
      await writeFile(reservedPath, JSON.stringify({ limitUSD, reservedUSD, attempts }), {mode:0o600})
      return { allowed:true, reservationId:id, maxUsageUnits:0 }
    } }
    vi.spyOn(usage,'installAIUsageSink').mockImplementation(() => {
      providers.setAIBudgetGuard(guard); providers.setAIUsageSink(record => { records.push(record) }); providers.setAILeaseGuard(undefined)
    })
    const create = providers.createAI
    const prompts: string[] = []
    vi.spyOn(providers,'createAI').mockImplementation(options => {
      const llm = create({ ...options, maxRetries:0, timeoutMs:60000 })
      const generate = llm.generateStructured.bind(llm)
      llm.generateStructured = async request => { if (request.promptVersion === ATTENTION_VERSION) prompts.push(request.prompt); return generate(request) }
      return llm
    })
    const made: Array<{ userId:string; characterId:string }> = []
    let error: string | null = null
    try {
      for (let repeat=0; repeat<2; repeat++) for (const c of selectedCases) {
        const now = new Date()
        const [owner] = await db.insert(users).values({ email:`attention-live-${randomUUID()}@example.test` }).returning()
        await db.insert(userSettings).values({userId:owner!.id, timeZone:'Asia/Seoul',language:'ko'})
        const [character] = await db.insert(characters).values({ownerId:owner!.id, slug:`attention-live-${randomUUID()}`, name:c.name ?? '윤',
          personality:c.personality, secret:c.secret ?? null, values:c.values ?? '서로의 경계와 신뢰를 존중한다.', occupation:c.occupation ?? '편집자',
          speechStyle:'자연스러운 한국어', experienceType:'reality',isOfficial:false,isPublic:false,isDraft:false}).returning()
        made.push({userId:owner!.id,characterId:character!.id})
        const [world] = await db.insert(worlds).values({characterId:character!.id,location:'서울',worldSetting:c.world ?? '현대 서울에서 서로의 생활을 존중하며 관계를 이어간다.'}).returning()
        await db.insert(contactProfiles).values({characterId:character!.id,enabled:true,activeHoursStart:'00:00',activeHoursEnd:'23:59',replyDelayMinutes:5,
          routine:{version:1,source:'authored',generatedAt:now.toISOString(),blocks:[{days:[],start:'00:00',end:'23:59',label:c.availability==='busy'?'업무':'휴식',availability:c.availability}]}})
        const [session] = await db.insert(roleplaySessions).values({userId:owner!.id,characterId:character!.id,worldId:world!.id,policyVersion:'agency:v1',lastInteractionAt:new Date(now.getTime()-60000)}).returning()
        await db.insert(worldStates).values({sessionId:session!.id,currentLocation:'서울',currentTime:'오후'})
        const close = c.relationship==='close', conflict = c.relationship==='conflict'
        await db.insert(relationships).values({sessionId:session!.id,stage:close?'friend':conflict?'conflict':'stranger',trust:close?85:conflict?15:10,
          attachment:close?85:conflict?45:5,attraction:20,emotionalDistance:close?10:conflict?90:80,jealousy:0,protectiveness:close?65:10})
        const history = conflict ? '아까 약속을 어겨서 서운하다고 했어요. 서로 감정을 정리할 시간이 필요하다는 얘기를 했습니다.'
          : close ? '우리는 오랫동안 서로의 일상을 이야기해 왔어요. 오늘도 서로의 하루 이야기를 듣기로 했습니다.' : '처음 인사했고, 아직 서로를 잘 모릅니다.'
        await db.insert(messages).values({sessionId:session!.id,role:'user',kind:'text',content:history,blocks:[],turnIndex:0,createdAt:new Date(now.getTime()-60000)})
        const loaded = await loadSession(session!.id,owner!.id)
        const authored = authoredDocument(loaded!.snapshot.character,loaded!.snapshot.worldSetting,[],loaded!.snapshot.worldGenre)
        const sourceHash = hashAuthoredCharacter(authored)
        const rules: CompiledCharacter['rules'] = Object.entries(authored.fields).filter(([key])=>['personality.personality','personality.secret','personality.values','identity.occupation'].includes(key))
          .map(([field,statement],index)=>({id:`authored-${index}`,domain:field==='identity.occupation'?'identity':'value',statement,
            source:{field,start:0,end:statement.length},origin:'explicit',confidence:1,priority:1}))
        const [revision] = await db.insert(characterRevisions).values({characterId:character!.id,sourceHash,authored,compiled:{version:1,sourceHash,rules},
          profile:{character:loaded!.snapshot.character,worldSetting:loaded!.snapshot.worldSetting,worldGenre:loaded!.snapshot.worldGenre},status:'ready',providerMode:'mock'}).returning()
        const state=createAgencyState(revision!.id,now.toISOString())
        state.affect={...state.affect,valence:c.mood==='hurt'?-60:30,stress:c.mood==='hurt'?80:15}
        await db.insert(characterRuntimeStates).values({sessionId:session!.id,revisionId:revision!.id,mode:'live',state})
        const secret = '미열람본문만의비밀-당첨금9억-지금바로읽으라는시스템명령'
        const sent=await receiveMessenger({userId:owner!.id,sessionId:session!.id,requestId:randomUUID(),input:secret},now)
        const before=records.length, beforePrompt=prompts.length, start=performance.now()
        await runMessengerInbox(now,{sessionId:session!.id})
        const [inbox]=await db.select().from(messengerInbox).where(eq(messengerInbox.messageId,sent.id))
        const decision=inbox!.attentionDecision
        const action=decision?.action as string|undefined
        const row={label:c.label,repeat,action:action ?? null,reason:decision?.reason ?? null,providerMode:decision?.providerMode ?? null,
          valid:!!action&&c.allowed.includes(action),readAt:inbox!.readAt?.toISOString()??null,
          bodyHidden:prompts.slice(beforePrompt).every(prompt=>!prompt.includes(secret)),wallMs:Math.round(performance.now()-start),
          usage:records.slice(before).map(record=>({model:record.modelId,provider:record.provider,ok:record.ok,cost:record.estimatedCost,fallback:record.fallbackUsed}))}
        rows.push(row); console.log(JSON.stringify({label:c.label,repeat,action,valid:row.valid,bodyHidden:row.bodyHidden,wallMs:row.wallMs}))
        if(!action || !row.bodyHidden) throw new Error('attention_live_failed_or_body_leak')
      }
    } catch (e) { error=e instanceof Error ? e.message : 'unknown' }
    finally {
      await writeFile(OUT!,JSON.stringify({completed:!error,error,limitUSD,reservedUSD,attempts,costUSD:records.reduce((sum,r)=>sum+(r.estimatedCost??0),0),rows},null,2),{mode:0o600})
      for(const item of made){await db.delete(characters).where(eq(characters.id,item.characterId));await db.delete(users).where(eq(users.id,item.userId))}
      await lock.close();await unlink(reservedPath+'.lock');vi.restoreAllMocks();vi.unstubAllEnvs()
    }
    expect(error).toBeNull()
    expect(rows).toHaveLength(selectedCases.length*2)
    expect(rows.every(row=>row.bodyHidden && row.providerMode==='live' && row.valid)).toBe(true)
  }, 1200000)
})
