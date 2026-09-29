import { POLICY, usagePolicy } from '@miro/config'
import type { ReplyStyle, SimulationSnapshot } from './context'

/**
 * 한 턴의 정책(docs/agency-core-transition-plan.md §3.1). 서버가 한 번 확정하는 작은 명시적 객체다 —
 * 경험(일반/미로) × 등급(MIRO/ECHO) × 채널 × 운영 상태를 분리해 두고, 생성 옵션과 권한을 여기서만 끌어낸다.
 * 범용 워크플로 엔진이 아니다. 값은 브라우저가 보낸 플래그가 아니라 서버가 검증한 입력에서만 나온다.
 */
export type TurnExperience = 'chat' | 'reality'
export type TurnTier = 'miro' | 'echo'
export type TurnChannel = 'scene' | 'messenger' | 'voice_call' | 'video_call' | 'background'
export type TurnEngine = 'legacy' | 'agency'
export type AgencyRequest = 'off' | 'shadow' | 'live'

export type TurnPolicy = {
  version: 'turn-policy:v1'
  experience: TurnExperience
  tier: TurnTier
  channel: TurnChannel
  /** 실제로 쓰는 경로. 자율성은 코호트가 live 이고 이 세션의 개정판이 컴파일돼 있을 때만이다. */
  engine: TurnEngine
  /** 코호트가 요청한 모드. engine 과 다르면 준비 전 보류 상태다(기존 대화 유지, 새 자율 행동 보류). */
  agencyMode: AgencyRequest
  /** 사용자 월간 사용량을 차감하는 턴인가. ECHO 만이다. */
  metered: boolean
  generation: { maxOutputTokens: number; contextScale: number; auxiliary: 'planned' | 'always'; replyLength: ReplyStyle }
  /** 세계·장면·사건·NPC 변경. 일반 캐릭터는 어느 등급에서도 없다. */
  permissions: { worldChange: boolean; proactiveContact: boolean }
  /** 기억 추출·요약을 응답 안에서 기다리는가(inline), 커밋 뒤 작업으로 넘기는가(deferred, §3.5). */
  memory: 'inline' | 'deferred'
  /** ai_usage.origin — 호출이 어느 경로에서 나왔는지. */
  origin: string
}

export type TurnPolicyInput = {
  experience: TurnExperience
  tier: TurnTier
  channel: TurnChannel
  agencyMode: AgencyRequest
  /** 이 세션의 자율성 런타임이 live 로 로드됐는가(개정판 컴파일 완료). */
  agencyReady: boolean
  /** continuity 여유분으로 나가는 턴 — 등급과 무관하게 최소로 답한다. */
  continuity?: boolean
  memory?: 'inline' | 'deferred'
}

export function resolveTurnPolicy(input: TurnPolicyInput): TurnPolicy {
  const reality = input.experience === 'reality'
  const engine: TurnEngine = reality && input.agencyMode === 'live' && input.agencyReady ? 'agency' : 'legacy'
  const tier = POLICY.chatTier[input.tier]
  // 문자·통화의 길이는 모드 규칙(CALL_MODE_RULES)이 정하고 장면 지시는 무시된다 — 등급의 값을 그대로 둬야 promptVersion 라벨이 안 바뀐다(1단계: 동작 보존).
  const replyLength: ReplyStyle = tier.replyLength
  const generation = input.continuity
    ? { maxOutputTokens: usagePolicy().continuity.maxOutputTokens, contextScale: 1, auxiliary: 'planned' as const, replyLength: 'scene' as const }
    : { maxOutputTokens: tier.maxOutputTokens, contextScale: tier.contextScale, auxiliary: tier.auxiliary, replyLength }
  return {
    version: 'turn-policy:v1', experience: input.experience, tier: input.tier, channel: input.channel, engine, agencyMode: input.agencyMode,
    // ECHO 는 사용량만 더 쓴다. 권한은 경험이 정한다(§3.1: ECHO 는 행동 권한을 늘리지 않는다).
    metered: input.tier === 'echo' && !input.continuity,
    generation,
    permissions: { worldChange: reality, proactiveContact: reality },
    memory: input.memory ?? 'inline',
    origin: `${input.channel === 'background' ? 'reality' : 'turn'}:${engine}:${input.experience}:${input.tier}:${input.channel}`,
  }
}

/**
 * 정책을 넘기지 않는 호출(테스트·옛 경로)의 기본값 — 지금까지의 runTurn 옵션과 같은 뜻이다.
 * 등급을 넘기지 않으면 MIRO 한도를 쓴다(통화·Live Scene 이 ECHO 상한을 물려받지 않게).
 */
export function policyForSnapshot(snapshot: SimulationSnapshot, opts: {
  agencyMode?: AgencyRequest; agencyReady?: boolean; maxOutputTokens?: number; contextScale?: number
  auxiliary?: 'planned' | 'always'; replyLength?: ReplyStyle; memory?: 'inline' | 'deferred'
} = {}): TurnPolicy {
  // 옛 호출·픽스처는 experienceType 이 없다 — 지금까지처럼 'chat' 이라고 적힌 것만 일반 캐릭터로 본다.
  const experience: TurnExperience = snapshot.experienceType === 'chat' ? 'chat' : 'reality'
  const channel: TurnChannel = snapshot.mode === 'messenger' ? 'messenger' : snapshot.mode === 'voice_call' ? 'voice_call' : snapshot.mode === 'video_call' ? 'video_call' : 'scene'
  const base = resolveTurnPolicy({ experience, tier: 'miro', channel, agencyMode: opts.agencyMode ?? 'off', agencyReady: opts.agencyReady ?? false, memory: opts.memory })
  return { ...base, generation: {
    maxOutputTokens: opts.maxOutputTokens ?? base.generation.maxOutputTokens, contextScale: opts.contextScale ?? base.generation.contextScale,
    auxiliary: opts.auxiliary ?? base.generation.auxiliary, replyLength: opts.replyLength ?? base.generation.replyLength,
  } }
}
