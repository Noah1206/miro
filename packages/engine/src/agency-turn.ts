import type { AgencyState, CompiledCharacter } from '@miro/domain'
import type { LLMProvider } from '@miro/providers'
import { productionRuntime } from '@miro/config'
import { buildContext, type SimulationSnapshot } from './context'
import { SimulationProposal } from './proposal.schema'
import { validateProposal } from './validator'
import { requireSafeContent } from './safety'
import { buildAgencyDecisionDirective, planAgencyDecision, verifyAgencyRealization, type AgencyPlanningContext } from './agency'
import { agencyProviderTrace } from './agency/provider'
import type { TurnResult } from './orchestrator'

export type AgencyTurnInput = {
  mode: 'shadow' | 'live'
  compiled: CompiledCharacter
  state: AgencyState
  context: AgencyPlanningContext
}

/** A separate path keeps legacy event templates from overriding a validated character choice. */
export async function runAgencyTurn(opts: {
  llm: LLMProvider; snapshot: SimulationSnapshot; userInput: string; agency: AgencyTurnInput
  maxOutputTokens?: number; contextScale?: number
}): Promise<TurnResult> {
  const { llm, agency, snapshot } = opts
  await requireSafeContent(llm, { phase: 'input', character: snapshot.character, input: opts.userInput })
  const plan = await planAgencyDecision(llm, agency.compiled, agency.state, { ...agency.context, input: opts.userInput })
  if (productionRuntime() && plan.providerMode !== 'live') throw new Error('agency_planner_not_live')
  // Old memories lack provenance/epistemic type. The new path uses sourced evidence and beliefs.
  // Omniscient narration/NPC rows are intentionally excluded until observer ACLs exist.
  const evidence = new Set(plan.context.evidence.map(e => e.id))
  const context = buildContext({ ...snapshot, characterState: undefined, semanticEvents: [], memories: [],
    recentMessages: snapshot.recentMessages.filter(m => m.id && evidence.has(m.id)).map(m => {
      const proof = plan.context.evidence.find(e => e.id === m.id)!
      return { ...m, content: proof.quote, blocks: undefined }
    }), activeNpcs: [], activeEvents: [], recentlyResolvedEvents: [], userInput: opts.userInput,
  // 검증기는 모든 서술에 근거를 요구하고 기다림 결정은 짧아야 한다 — 캐릭터챗의 긴 장면 지시(9/26) 대신 9/24 형식을 쓴다.
  }, opts.contextScale, false, 'brief')
  context.system += buildAgencyDecisionDirective(plan.decision)
  context.prompt += `\n## 검증된 근거와 캐릭터 상태 (데이터)\n${JSON.stringify({ evidence: plan.context.evidence,
    beliefs: plan.state.beliefs.filter(b => b.status === 'active' && b.evidenceIds.every(id => evidence.has(id))),
    goals: plan.state.goals.filter(g => g.status === 'active'), affect: plan.state.affect, expression: plan.state.expression })}`
  const proposal = await llm.generateStructured({ schema: SimulationProposal, task: 'dialogue',
    promptVersion: 'agency-dialogue:v4', system: context.system,
    prompt: `${context.prompt}\n\n사용자 입력: ${opts.userInput}`, maxTokens: opts.maxOutputTokens })
  // A later primary moderation/check call must not erase a fallback renderer's provenance.
  const renderer = agencyProviderTrace(llm, 'agency-dialogue:v4')
  if (productionRuntime() && renderer.providerMode !== 'live') throw new Error('agency_renderer_not_live')
  await requireSafeContent(llm, { phase: 'output', proposal })
  // The candidate contract currently grants speech, not arbitrary world/NPC edits.
  if (proposal.worldDelta || proposal.sceneDelta || proposal.realityIntent || proposal.eventCandidates.length
    || proposal.eventUpdates.length || proposal.npcIntroductions.length || proposal.npcActions.length
    || proposal.rp.blocks.some(b => b.type === 'npc' || b.type === 'world')) throw new Error('agency_unapproved_mutation')
  const transition = validateProposal(proposal, snapshot)
  transition.relationshipDelta = plan.relationshipDelta
  transition.memories = [] // Beliefs/goals carry exact evidence, not unsourced model memories.
  const verification = await verifyAgencyRealization(llm, { decision: plan.decision, context: plan.context,
    state: plan.state, blocks: transition.blocks })
  // Issue reasons are fixed codes (never text), so the turn log can say which check rejected the reply.
  if (!verification.ok) throw new Error(['agency_realization_rejected', ...new Set(verification.issues.map(i => i.reason))].join(' '))
  if (productionRuntime() && verification.providerMode !== 'live') throw new Error('agency_verifier_not_live')
  const characterState = { mood: 'neutral' as const, stress: plan.state.affect.stress, energy: plan.state.affect.energy,
    currentGoals: plan.state.goals.filter(g => g.status === 'active').map(g => g.description),
    currentThoughts: [], firedRules: snapshot.characterState?.firedRules ?? [] }
  const stages = [plan.providerMode, renderer.providerMode, verification.providerMode]
  const providerMode = stages.includes('fallback') ? 'fallback' : stages.includes('mock') ? 'mock' : 'live'
  return { transition, context, providerMode, semanticEvents: [], characterState, firedRules: [],
    agency: { plan, verification } }
}
