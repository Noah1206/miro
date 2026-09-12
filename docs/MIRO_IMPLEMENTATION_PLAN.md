# MIRO Launch v1 — Implementation Plan

> **Status**: Phase 0 (Audit & Architecture)
> **Last updated**: 2026-09-12
> **Source of Truth**: `미로_기능명세서.md`, `미로_유저플로우.md`

---

## 0. 문서 충돌 및 기록

| # | 항목 | 내용 | 처리 |
|---|---|---|---|
| C-1 | 문서명 불일치 | 지시서는 `MIRO_기능명세서_수정본.md` / `MIRO_유저플로우_수정본.md`를 참조하나, 실제 파일은 `미로_기능명세서.md` / `미로_유저플로우.md` (수정본 접미사 없음) | 실제 존재 파일을 SoT로 사용. 더 최신 "수정본" 제공 시 재반영 |
| C-2 | 플랫폼 | 기능명세서 "디바이스: 모바일 앱". 사용자 지시: **웹앱 우선, 유저 확보 후 네이티브 앱** | 웹앱(PWA) 우선. 도메인/API는 플랫폼 무관하게 설계하여 네이티브 전환 시 100% 재사용 |
| C-3 | 결제 | 기능명세서 10장 Pro 결제 전체 | **Launch v1 범위에서 최후순위(Phase 13)로 이동.** 자격(entitlement) 모델·Usage Guard·요금제 비교 화면은 지금 구현, PG 연동만 보류 |
| C-4 | 야간 연락 | 명세서 5.1 예외: "야간 선연락은 **기본으로 차단**하고 사용자가 설정에서 켤 수 있다" / 지시서 18장: "야간 Contact를 시스템 전역에서 강제 차단하지 않는다" | 명세서 우선. `quietHours`가 **기본 활성(DEV_DEFAULT 23:00–08:00)**, 사용자가 끌 수 있음. 지시서의 "전역 강제 차단 금지"는 "Simulation State는 유지하고 발송만 억제"로 해석 — 양자 만족 |
| C-5 | 성인 인증 재시도 | 명세서 7.1: 실패 시 24시간 후 재시도 | 그대로 채택 |

---

## 1. Repository Audit 결과

### 1.1 현재 상태

```
/Users/johyeon-ung/Desktop/Miro/
├── 미로_기능명세서.md      (63KB, 803 lines)
└── 미로_유저플로우.md      (4.5KB, Mermaid flowchart)
```

**코드 0줄. 완전 greenfield.**

### 1.2 Toolchain

| 항목 | 버전 | 비고 |
|---|---|---|
| Node | 20.19.6 | ⚠ Next 15 + React 19는 Node 22+ 권장 → **R-7** |
| pnpm | 9.0.0 | 채택 |
| PostgreSQL | 14.16 (local) | 로컬 개발용. 운영은 관리형 Postgres |
| git | 2.52.0 | repo 초기화 완료 |

### 1.3 코드 분류

| 분류 | 대상 |
|---|---|
| 그대로 재사용 | 없음 |
| 수정 후 재사용 | 없음 |
| 신규 구현 | 전부 |
| Deprecated | 없음 |

---

## 2. PRD 대비 구현 상태

**전체 구현율: 0%**

| # | 기능 영역 | 상태 | 목표 Phase |
|---|---|---|---|
| 1 | 계정 및 온보딩 | Missing | P1 |
| 2 | 캐릭터 탐색 및 생성 | Missing | P2, P3 |
| 3 | 자유 역할극 대화 | Missing | P4 |
| 4 | 세계·관계·사건 엔진 | Missing | P5 |
| 5 | 현실 연동 및 몰입 미디어 | Missing | P6, P7, P8 |
| 6 | 사용량·구독 및 설정 | Missing | P9 (결제 제외) |
| 7 | 안전·권리 및 데이터 보호 | Missing | P10 |
| 8 | 캐릭터 및 역할극 보관함 | Missing | P10 |
| 9 | 콘텐츠 신고 및 운영 대응 | Missing | P10, P11 |
| 10 | Pro 구독 결제 및 관리 | Missing | **P13 (최종)** |
| 11 | 장기 기억 및 관계 맥락 | Missing | P5 |
| 12 | 계정 삭제 및 개인 데이터 처리 | Missing | P10 |

---

## 3. 구조적 리스크

빈 repo이므로 "기존 구조의 문제"는 없다. 대신 **초기 결정이 잘못되면 되돌리기 비싼 항목**을 리스크로 관리한다.

| ID | 리스크 | 영향 | 대응 |
|---|---|---|---|
| **R-1** | Chatbot 구조로 시작 | 치명적. `messages` append + 전체 history 전송 구조를 한 번 만들면 Simulation State를 나중에 끼워 넣을 수 없다 | **첫 커밋부터 SimulationState가 SoT.** Message는 표현 로그일 뿐 |
| **R-2** | 웹앱에는 네이티브 Push가 없음 | Reality Activation(핵심 차별점) 불능 위험 | Web Push (VAPID) + Service Worker. **iOS Safari는 PWA 설치 상태에서만 Push 허용** → 설치 유도 UX 필요 |
| **R-3** | Provider 전부 TBD | SDK 직결 시 교체할 때 전면 재작성 | Provider Adapter Layer + AI Gateway `"provider/model"` 문자열 |
| **R-4** | Usage 이중 차감 | 과금/원가 사고 | `usage_ledger.idempotency_key` unique + Transaction |
| **R-5** | 동시 RP State 덮어쓰기 | 관계/세계 상태 유실 | `version` 컬럼 optimistic lock |
| **R-6** | Video Call 웹 구현 난이도 | Phase 8 지연 | Architecture + CallSession 기록은 v1 완성, 실시간 렌더링은 Adapter 교체 |
| **R-7** | Node 20 | Next 15 빌드 경고 | 개발 중 Node 22 LTS 권장 (블로커 아님) |
| **R-8** | 고정 스토리 구조로 회귀 | 제품 정체성 붕괴 | Phase 12의 Non-linear Simulation Test(§36-A)를 **CI 필수 게이트**로 |

---

## 4. Architecture

### 4.1 디렉토리 구조

```
miro/
├── apps/
│   ├── web/                     Next.js App Router — 사용자 웹앱 (PWA)
│   │   ├── app/(auth)/          splash, login, signup, terms
│   │   ├── app/(main)/          home, character, create, chat, archive, my
│   │   ├── app/(immersive)/     live-scene, call, video-call
│   │   └── app/api/             API Routes
│   └── admin/                   운영 콘솔 — 별도 auth, 사용자 앱 진입점과 완전 분리
├── packages/
│   ├── domain/                  ★ Provider·DB 무의존 순수 도메인
│   │   ├── character/  world/  relationship/  event/
│   │   ├── npc/  memory/  scene/  reality/  usage/
│   ├── engine/                  Simulation Orchestrator
│   ├── providers/               LLM / Image / Voice / Video / Push / Payment Adapter
│   ├── db/                      Drizzle schema + migrations
│   └── config/                  Policy config (TBD 값 중앙화)
└── docs/
```

**불변식**: `packages/domain`은 DB도 Provider도 import하지 않는다. 순수 함수 + 타입만. → Unit Test가 빠르고, 네이티브 앱 전환 시 그대로 재사용.

### 4.2 Simulation 파이프라인

```
User Action
    │
    ▼
┌─────────────────────────────────────────────────┐
│ ContextBuilder                                  │
│   Character Core · World · Relationship         │
│   Relevant Memory · Recent Messages             │
│   Active Event · Active NPC · Scene             │
│   Recent Reality Contacts                       │
│   → Context Budget 관리                          │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│ UsageGuard.reserve()   ← Provider 호출 전 필수    │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│ RPGenerator — 1회 Structured Generation         │
│   LLMProvider.generateStructured(schema)        │
└──────────────────┬──────────────────────────────┘
                   ▼
            SimulationProposal
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Validator                                       │
│   1. Zod Schema Validation                      │
│   2. Domain Validation (존재하는 NPC/Event인가)   │
│   3. Allowed Transition 검사                     │
│   4. Conflict 검사                               │
│   5. Clamp / Normalize                          │
│   실패 → Limited Retry(최대 1회) → Safe Fallback  │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│ TransitionResolver                              │
│   Delta + Current State → Next State            │
│   Event Eligibility / Cooldown / Relevance      │
│   Memory Salience 판정                           │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│ Commit — 단일 Transaction                        │
│   optimistic lock(version) 검사                  │
│   World / Relationship / Event / NPC /          │
│   Memory / Scene / Message / UsageLedger        │
│   충돌 시 → 재조회 후 1회 재시도                    │
└──────────────────┬──────────────────────────────┘
                   ▼
              Response
```

**핵심**: LLM은 **Proposal만** 반환한다. DB에 직접 쓰지 않는다. Application Layer가 최종 권한을 갖는다.

### 4.3 SimulationProposal 스키마 (초안)

```ts
const SimulationProposal = z.object({
  rp: z.object({
    blocks: z.array(z.object({
      type: z.enum(['dialogue','action','narrative','npc','world']),
      speaker: z.string().nullable(),
      text: z.string(),
    })),
  }),
  worldDelta:        WorldDelta.nullable(),
  relationshipDelta: RelationshipDelta.nullable(),
  memoryCandidates:  z.array(MemoryCandidate).max(3),
  eventCandidates:   z.array(EventCandidate).max(2),
  npcActions:        z.array(NpcAction).max(3),
  sceneDelta:        SceneDelta.nullable(),
  realityIntent:     RealityIntent.nullable(),
})
```

`RelationshipDelta`의 각 차원은 **정수 delta**이며 Validator에서 turn당 `[-15, +15]`로 clamp (`DEV_DEFAULT`). 절대값 지정 불가 — AI가 `trust: 100`처럼 상태를 덮어쓰는 것을 구조적으로 차단.

### 4.4 Non-linear 보장 메커니즘

지시서 §0-A의 핵심. 코드 레벨에서 다음을 **금지**한다:

- `dayCount`, `turnCount`를 Event 발생 조건의 **단독** 입력으로 사용 금지
- Event 간 `nextEventId` 같은 순서 필드 금지
- `relationshipStage`를 기능 unlock 조건으로 사용 금지

Event 발생은 `EventEligibility`로만:

```ts
type EventEligibility = {
  triggerSignals:     Signal[]    // 상태에서 파생된 신호
  blockingConditions: Condition[] // 현재 Event/Scene과 충돌
  cooldownUntil:      Date | null
  relevance:          number      // 현재 서사 맥락 적합도
  salience:           number      // 감정적 압력
}
```
조건 충족 = **발생 가능**일 뿐 발생 확정이 아니다. Weighted selection + `maxActiveEvents`(`DEV_DEFAULT` 2)로 남발 억제.

---

## 5. Data Model

### 5.1 테이블 (22)

**M1 — Core (Phase 1–4)**
`users` · `accounts` · `auth_sessions` · `terms_consents` · `characters` · `character_visual_identities` · `worlds` · `world_states` · `relationships` · `roleplay_sessions` · `messages`

**M2 — Simulation & Media (Phase 5–8)**
`events` · `npcs` · `memories` · `scenes` · `generated_media` · `contact_profiles` · `reality_contacts` · `call_sessions`

**M3 — Usage & Ops (Phase 9–11)**
`usage_windows` · `usage_ledger` · `subscriptions` · `reports` · `admin_actions` · `account_deletions`

### 5.2 핵심 제약

| 목적 | 제약 |
|---|---|
| 동시 State 덮어쓰기 방지 | `world_states.version`, `relationships.version` — optimistic lock |
| Usage 이중 차감 방지 | `usage_ledger.idempotency_key` UNIQUE |
| 중복 Reality Contact 방지 | `reality_contacts (session_id, dedupe_key)` UNIQUE |
| 중복 Call 방지 | `call_sessions` partial UNIQUE `WHERE status='ringing'` |
| Memory Isolation | `memories.session_id` NOT NULL + 모든 조회에 session scope 강제 |
| 삭제 복구 | `roleplay_sessions.deleted_at` soft delete |

### 5.3 JSON 사용 원칙

정규화: User/Character/Session/Message/Event/Memory의 FK 관계.
JSONB 허용: `character_visual_identities.profile`, `world_states.snapshot`, `generated_media.provider_metadata`, `messages.blocks`.

### 5.4 Migration 계획

| Migration | Phase | 내용 |
|---|---|---|
| `0001_core` | P1 | M1 전체 |
| `0002_simulation` | P5 | events, npcs, memories, scenes |
| `0003_media_reality` | P6–P7 | generated_media, contact_profiles, reality_contacts |
| `0004_calls` | P8 | call_sessions |
| `0005_usage` | P9 | usage_windows, usage_ledger, subscriptions(자격만) |
| `0006_ops` | P10–P11 | reports, admin_actions, account_deletions |

---

## 6. Provider Architecture

```ts
interface LLMProvider {
  generateStructured<T>(opts: { schema: ZodSchema<T>; context: BuiltContext }): Promise<T>
}
interface ImageProvider  { generate(spec: ImageSpec): Promise<GeneratedMedia> }
interface VoiceProvider  { startSession(spec: VoiceSpec): Promise<VoiceSession> }
interface VideoProvider  { startSession(spec: VideoSpec): Promise<VideoSession> }
interface PushProvider   { send(target: PushTarget, payload: PushPayload): Promise<void> }
interface PaymentProvider{ /* Phase 13 */ }
```

**Provider 미구성 시**: Mock 구현체가 동작하되, 개발 환경에 `Mock Provider Active` 배지를 명시 표시. 실제 AI처럼 위장하지 않는다.

Domain(`World`/`Relationship`/`Event`/`Memory`/`Reality`/`Usage`)은 Provider를 import하지 않는다.

---

## 7. Usage Architecture

```
AI Request
  → UsageGuard.reserve(userId, kind, idempotencyKey)
      · 활성 Window 조회 (없으면 지금을 시작점으로 생성)
      · plan 한도 대비 잔여 확인
      · 부족 → UsageExceeded (Free: Pro 안내 / Pro: Reset 대기 안내)
  → Provider 호출
  → UsageGuard.commit(reservationId, actualUsage)   실패 시 rollback
```

**5시간 Window**: 시작 시점 = **첫 생성 AI Request 시각**. 소진 시점이 아니다.

**정책값 전부 `packages/config/policy.ts`에 중앙화** — 코드에 하드코딩 금지:

```ts
export const POLICY = {
  usage: {
    windowHours: 5,
    freeLimit:  DEV_DEFAULT(100),   // TBD
    proLimit:   DEV_DEFAULT(1000),  // TBD
    weights: { textRP: DEV_DEFAULT(1), photo: DEV_DEFAULT(10), /* TBD */ },
    chargeRealityContact: DEV_DEFAULT(false),
  },
  event:    { maxActive: DEV_DEFAULT(2), cooldownTurns: DEV_DEFAULT(8) },  // TBD
  reality:  { minGapMinutes: DEV_DEFAULT(90), maxPending: DEV_DEFAULT(2) }, // TBD
  quietHours:{ defaultEnabled: true, start: DEV_DEFAULT('23:00'), end: DEV_DEFAULT('08:00') },
  relationship: { deltaClampPerTurn: DEV_DEFAULT(15) },  // TBD
}
```

**Usage 소진 시에도** Relationship / World / Event / Memory / Character State는 유지·삭제 금지.

---

## 8. Reality Activation Architecture

```
Vercel Cron (주기적)
  → "지금 Contact 판단을 다시 해볼 시점인 Session" 조회
  → 각 Session에 대해 RealityEvaluator 실행:
       Personality · ContactStyle · Relationship · ActiveEvent
       · UnresolvedEvent · WorldState · CurrentTime · ActiveHours
       · LastContact · RecentUserPattern · Initiative
       · NotificationSettings · QuietHours · Cooldown
  → 동기 존재 시 Channel + Content 결정
  → WorldTranslation 적용 (CEO=사내 메신저 / Thomas=편지 / Hisashi=익명번호)
  → dedupe_key 확인 후 발송
```

**Scheduler는 "다음 스토리 이벤트를 예약"하지 않는다.** "지금 판단을 다시 해볼 시점인가"만 평가한다. 실제 발생은 현재 State가 결정한다.

Quiet Hours: Push/Incoming Call 발송만 억제. Simulation State는 정상 진행.

---

## 9. Test Strategy

### 9.1 Unit Test (Domain 필수)
Usage Window / Usage deduction / Provider failure rollback / Free·Pro / Relationship update / World update / Memory isolation / Reality Trigger / Quiet Hours / Duplicate Contact / Report permission / Admin RBAC

### 9.2 Non-linear Simulation Test — **CI 필수 게이트**

| # | 검증 |
|---|---|
| T1 | 동일 Character·동일 가입일의 두 User가 동일 Event Sequence를 갖지 않음 |
| T2 | 친절 vs 무시 → Relationship/Event 결과 분기 |
| T3 | 높은 Trust에서도 배신 Event 후 Trust 하락 가능 |
| T4 | 부상 Event가 다음 Turn에 이유 없이 사라지지 않음 |
| T5 | 동일 질투 Event가 연속 Turn 반복되지 않음 (cooldown) |
| T6 | Turn 수 경과만으로 Romance Stage 이동 불가 |
| T7 | Tokyo Hotel Scene → AI Photo가 Seoul Office 배경 불가 |
| T8 | 싸운 직후 Reality Message가 맥락 무시하고 친밀하게 오지 않음 |

### 9.3 E2E Scenario
지시서 §37 Scenario 1–7 전부. **Scenario 3(Usage→Pro 전환)은 Phase 13까지 Pro 전환을 dev 토글로 대체.**

---

## 10. Development Phases

| Phase | 내용 | 선행 |
|---|---|---|
| **P0** | Repository Audit · Architecture · 본 문서 | — |
| **P1** | Monorepo · Core Domain · DB(M1) · Auth · Terms · State Persistence | P0 |
| **P2** | Home · Official Character(토마스/강태윤/히사시) · Character Detail | P1 |
| **P3** | Quick Create · Advanced Editor · Face Cast Foundation · Draft Auto Save | P1 |
| **P4** | Roleplay Session · Chat UI · Structured RP Engine · ContextBuilder · **UsageGuard 인터페이스(no-op)** | P2, P3 |
| **P5** | World · Relationship · Event · NPC · Memory · State Transition | P4 |
| **P6** | Dynamic Scene · Background · AI Photo · Live Scene | P5 |
| **P7** | Reality Activation · Web Push · Contact Scheduler | P5 |
| **P8** | Voice Call · Video Call · Provider Layer · CallSession | P5 |
| **P9** | Global Usage Guard 실제 정책 · Free/Pro **자격 모델** · 요금제 비교 화면 | P4 |
| **P10** | Archive · Settings · Quiet Hours · Adult Verification · Reporting · Account Delete | P5 |
| **P11** | Web Admin (Report 검토 · RBAC · Audit Log) | P10 |
| **P12** | Analytics · QA · Performance · E2E · Non-linear Test 게이트 | P1–P11 |
| **P13** | **결제 시스템 연동** (PG · 구매 · 복원 · 해지 · Webhook) | P9, P12 |

**P4에서 UsageGuard 인터페이스를 먼저 심는 이유**: 나중에 모든 Provider 호출부를 다시 뜯지 않기 위해. 초기엔 항상 통과하는 no-op, P9에서 실제 정책으로 교체.

**P13 분리 근거**: Usage Guard는 `plan: 'free'|'pro'`만 읽으면 되고 그 값의 출처를 몰라도 된다. 결제는 `subscriptions`에 쓰는 주체만 추가하면 되므로 Domain 수정이 0이다. 개발 중 Pro 전환은 Admin/dev 토글(`DEV_DEFAULT`)로 처리.

---

## 11. Engineering Decisions

| # | 결정 | 근거 |
|---|---|---|
| E-1 | Next.js App Router + TypeScript | 웹앱·API·Admin 단일 코드베이스. 네이티브 전환 시 API/Domain 100% 재사용 |
| E-2 | PostgreSQL + Drizzle | Migration이 SQL 파일로 산출되어 리뷰 가능. JSONB 지원 |
| E-3 | Zod | Structured AI Output 검증 + 런타임 타입 안전 |
| E-4 | Auth.js | 직접 구현 금지 |
| E-5 | Vercel AI Gateway | Provider 교체가 설정값 변경으로 끝남 (TBD 대응) |
| E-6 | pnpm workspace monorepo | domain/engine을 앱과 분리하여 순수성 강제 |
| E-7 | Web Push (VAPID) | 웹앱에서 Reality Activation 구현 수단 |
| E-8 | Vercel Cron + Queues | Reality Scheduler. 앱 종료 후에도 동작 |
| E-9 | PWA | iOS Safari Push 요건 + 네이티브 앱 전환 전 사용자 경험 |

---

## 12. TBD

Free Limit · Pro Limit · Pro Price · LLM/Image/Voice/Video Provider · Provider Weight · Adult Verification Provider · Data Retention Period · Event Probability · Event Cooldown · Relationship Delta 값 · Reality Contact 빈도

전부 `packages/config/policy.ts`에서 `DEV_DEFAULT()` 로 표기하여 중앙 관리.
