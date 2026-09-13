# MIRO Launch v1 — Implementation Plan

> **Status**: **Phase 0–13 완료 + UI 리디자인(DESIGN.md) + Motion System + WCAG 2.2 AA 패스 완료.** 남은 것은 Product Decision(Provider 선택·가격·한도)과 배포 설정뿐
> **Last updated**: 2026-09-12 (Phase 6 이후 재감사)
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

**Phase 0–13 완료. 테스트 234 unit/integration + 34 e2e 통과, 두 앱 빌드 clean (DB 없이도 빌드됨), CI 워크플로 구성.**

| # | 기능 영역 | 상태 | 비고 |
|---|---|---|---|
| 1 | 계정 및 온보딩 | **Implemented** | 온보딩→가입/로그인→약관→첫 선택. 삭제 계정 로그인 차단 |
| 2 | 캐릭터 탐색 및 생성 | **Implemented** (Face Cast UI 제외) | 공식 3인 시드, Quick Create, 섹션형 고급 편집. Visual Identity는 자동 생성·전 미디어 참조 중이나 사용자가 외형을 고르는 UI는 Image Provider 확정 후 |
| 3 | 자유 역할극 대화 | **Implemented** | 1회 Structured Generation, 3가지 출력 스타일, 사건 카드 |
| 4 | 세계·관계·사건 엔진 | **Implemented** | version lock, delta clamp, eligibility+cooldown, NPC 지식 경계, 사건 해결/NPC 등장 |
| 5 | 현실 연동 및 몰입 미디어 | **Implemented** | Photo·Background·Live Scene·선연락·**음성/영상통화(수신/발신/거절/부재중/분당 과금, 실시간 미디어는 Mock Adapter)** |
| 6 | 사용량·구독 및 설정 | **Implemented** | Usage Guard, 5h 창, Free/Pro 자격, /my·/plans, 알림/통화/Quiet Hours/timezone 설정, 구독 관리 |
| 7 | 안전·권리 및 데이터 보호 | **Implemented** | 성인 인증(Mock Provider, 24h 재시도 잠금) + 정책 동의 + 실존 인물 참조 차단(gateMature) + 기기 권한 동의 기록 |
| 8 | 캐릭터 및 역할극 보관함 | **Implemented** | 진행 중/보관됨, 미확인 선연락 배지, 현재 장면, 삭제 확인, soft delete + 보존기간 후 purge(Cron) |
| 9 | 콘텐츠 신고 및 운영 대응 | **Implemented** | 신고 제출 + 별도 Admin 앱(자체 인증, RBAC, 목록/상세/맥락/조치/감사로그, 낙관적 잠금). 숨김·제한이 사용자 앱에 적용 |
| 10 | Pro 구독 결제 및 관리 | **Implemented (Mock PG)** | PaymentProvider Adapter + Mock. 구매→webhook(idempotent)→자격, 복원, 해지(기간 유지), 만료(Cron), 결제 실패 시 무자격. **실 PG 연결은 Adapter 1개 추가 + env** |
| 11 | 장기 기억 및 관계 맥락 | **Implemented** | 세션 격리, salience, dedupe, 중요도 기반 prune |
| 12 | 계정 삭제 및 개인 데이터 처리 | **Implemented** | 영향 정보 → 확정 → 로그인 차단·세션 폐기·Push 제거·soft delete·구독 해지, 반복 요청 idempotent |

**실제 적용 DB**: 31 테이블 / 12 migration (`0000_core` … `0011_payments`).

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
| **R-8** | 고정 스토리 구조로 회귀 | 제품 정체성 붕괴 | Non-linear Simulation Test(T1–T8)가 `pnpm test` 에 포함 → CI 게이트 ✅ |
| **R-9** | 인증/신고 엔드포인트 rate limit 없음 | 무차별 대입·신고 스팸 | 배포 인프라(Vercel Firewall) 규칙으로 적용. 앱 레벨 구현은 TBD |

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
| `0000_core` ✅ | P1 | users, accounts, auth_sessions, terms_consents, user_settings, characters, character_visual_identities, contact_profiles, worlds, world_states, relationships, roleplay_sessions, messages |
| `0001_character_presentation` ✅ | P2 | slug, role, relationship_keywords, accent |
| `0002_initial_relationship` ✅ | P2 | initial_relationship(jsonb), starting_time |
| `0003_simulation` ✅ | P4 | events, npcs, memories, scenes |
| `0004_media` ✅ | P6 | generated_media |
| `0005_reality` ✅ | P7 | reality_contacts(dedupe UNIQUE), push_subscriptions, sessions.pending_reality_intent / reality_checked_at / character_status, contact_profiles.presentation, user_settings.time_zone |
| `0007_calls` ✅ | P8 | call_sessions (세션당 ringing 1개 partial UNIQUE) |
| `0006_usage` ✅ | P9 | usage_windows, usage_ledger(idempotency UNIQUE), subscriptions(자격만) |
| `0008_ops` ✅ | P10 | reports(reporter+target UNIQUE, 스냅샷, version), account_deletions, users.mature_policy_agreed_at, user_settings.*_consent_at |
| `0009_admin` ✅ | P11 | admin_users, admin_sessions, admin_actions(append-only), messages.hidden_at, sessions.restricted_at |

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

**현재 상태**: T1–T8 전부 존재. T2/T3/T6은 실제 Postgres 다중 턴(`divergence.integration.test.ts`), **T8은 실제 발송 경로**(`apps/web/lib/reality/__tests__/evaluate.integration.test.ts`)에서 검증 — 싸운 직후 no_intent, 사건으로 강제되면 terse 톤.

### 9.3 E2E Scenario
지시서 §37 Scenario 1–7 전부. **Scenario 3(Usage→Pro 전환)은 Phase 13까지 Pro 전환을 dev 토글로 대체.**

**현재 상태** (Playwright 29개): Scenario 1·3·4 완결, Scenario 2·6 부분, Scenario 5 통합, 보관함/설정/신고/성인인증/계정삭제, Admin 검토 플로우(제한 → 사용자 턴 거부).

---

## 10. Development Phases

| Phase | 내용 | 선행 |
|---|---|---|
| **P0** ✅ | Repository Audit · Architecture · 본 문서 | — |
| **P1** ✅ | Monorepo · Core Domain · DB · Auth · Terms · State Persistence | P0 |
| **P2** ✅ | Home · Official Character(토마스/강태윤/히사시) · Character Detail | P1 |
| **P3** ✅ | Quick Create · Advanced Editor · Provider Adapter (Face Cast UI는 Image Provider 확정 후) | P1 |
| **P4** ✅ | Roleplay Session · Chat UI · Structured RP Engine · ContextBuilder (UsageGuard no-op은 미이행 → P9) | P2, P3 |
| **P5** ✅ | World · Relationship · Event · NPC · Memory · State Transition · Scenario 6 검증 | P4 |
| **P6** ✅ | Dynamic Scene · Background · AI Photo · Live Scene | P5 |
| **P7** ✅ | Reality Activation · Web Push(VAPID) · Cron Scheduler(SKIP LOCKED claim) · World Translation(데이터) · timezone Quiet Hours | P5 |
| **P9** ✅ | Usage Guard(reserve/commit/rollback, advisory lock, idempotency) · Free/Pro 자격(effectivePlan) · /my · /plans · dev Pro 토글 | P4 |
| **P8** ✅ | 통화 = 같은 시뮬레이션의 mode(voice_call/video_call). 수신 UI 채널별 분리, 수락 시점 과금, 종료 시 실제 분 보정, 부재중 만료(Cron), CallMediaProvider Mock | P5, P9 |
| **P10** ✅ | Archive · Settings · Quiet Hours · Permissions · Adult Verification · Mature gate · Reporting · Account Delete · retention purge | P5 |
| **P11** ✅ | `apps/admin` 별도 앱 · 별도 쿠키/테이블 · RBAC(viewer/reviewer/superadmin) · 상태 전이 표 · version 낙관적 잠금 · 감사 로그 · 사용자 앱에 admin 경로/링크 없음(테스트로 고정) | P10 |
| **P12** ✅ | analytics_events + sanitize(관계 수치·본문 차단) · 퍼널 19개 이벤트 wiring · `observe()` 구조화 로그(원시값만) · `/api/health`(Provider mock 명시) · 보안 헤더 · lazy DB client(빌드 무의존) · Playwright webServer · GitHub Actions(Postgres service, T1–T8 게이트) · README · .env.example | P1–P11 |
| **P13** ✅ | PaymentProvider Adapter(Mock, 화면에 명시) · payment_events (provider, event_id) UNIQUE · 구매 시 현재 창 한도를 Pro 로 즉시 상향 · 복원 · 해지 후 기간 유지 · Cron 만료 · webhook 서명 검증 | P9, P12 |

**계획 이탈 해소** — P9를 P7 직후로 당겨 실행했다. `guarded()` 한 함수가 호출부 6곳(chat, live, photo, create, media 생성, 선연락 사진은 정책상 무차감)을 감싼다. 이후 P8 통화 경로는 처음부터 이 함수를 쓴다.

**P13 분리 근거**: Usage Guard는 `plan: 'free'|'pro'`만 읽으면 되고 그 값의 출처를 몰라도 된다. 결제는 `subscriptions`에 쓰는 주체만 추가하면 되므로 Domain 수정이 0이다. 개발 중 Pro 전환은 Admin/dev 토글(`DEV_DEFAULT`)로 처리.

---

## 11. Engineering Decisions

| # | 결정 | 근거 |
|---|---|---|
| E-1 | Next.js App Router + TypeScript | 웹앱·API·Admin 단일 코드베이스. 네이티브 전환 시 API/Domain 100% 재사용 |
| E-2 | PostgreSQL + Drizzle | Migration이 SQL 파일로 산출되어 리뷰 가능. JSONB 지원 |
| E-3 | Zod | Structured AI Output 검증 + 런타임 타입 안전 |
| E-4 | ~~Auth.js~~ → **scrypt + 세션 쿠키 직접 구현** | 소셜 Provider 미확정 상태에서 Auth.js는 어댑터 설정만 늘림. `accounts.provider` 컬럼이 이미 있어 소셜 추가 시 그대로 확장. **계획과 다르게 결정한 항목** |
| E-5 | Vercel AI Gateway | Provider 교체가 설정값 변경으로 끝남 (TBD 대응) |
| E-6 | pnpm workspace monorepo | domain/engine을 앱과 분리하여 순수성 강제 |
| E-7 | Web Push (VAPID) | 웹앱에서 Reality Activation 구현 수단 |
| E-8 | Vercel Cron + Queues | Reality Scheduler. 앱 종료 후에도 동작 |
| E-9 | PWA | iOS Safari Push 요건 + 네이티브 앱 전환 전 사용자 경험 |
| E-10 | World Translation은 코드 분기가 아니라 `contact_profiles.presentation` 데이터 | 캐릭터 추가 시 코드 수정 없음. 사용자 생성 캐릭터도 같은 경로 |
| E-11 | 선연락 동기 = 의도(deriveIntent) → 평가(evaluator) 2단 | 의도가 있어도 발송이 확정되지 않는다. 사건이 있어도 관계 없는 stranger에겐 보내지 않음(테스트로 고정) |
| E-12 | `POLICY.reality.motivationThreshold` (DEV_DEFAULT 0.5) | 침묵만으로 연락이 가려면 적극적 캐릭터 + 가까운 관계 필요. **Product feel 튜닝 대상** |
| E-13 | Cron 엔드포인트 dev 전용 `?now=` 오버라이드 | 활동시간/Quiet Hours가 현지 시각에 묶이므로 E2E는 시각을 고정해야 함. **E2E에서 세션을 backdate 할 때는 이 고정 시각보다 앞이어야 claim 된다** |
| E-14 | 통화는 별도 엔진이 아니라 `SimulationSnapshot.mode` | 통화 중 발화가 관계·세계·기억에 그대로 반영. Validator가 모드에 맞지 않는 블록(전화 중 서술)을 버림 |
| E-15 | 전화/영상 선택은 난수가 아니라 임계값 | `pickCallChannel(profile, urgency)` — 같은 상태면 같은 결과. profile.callProbability는 "성향"으로 해석 |
| E-16 | 수신 통화 과금은 수락 시점 | 받지 않은 통화에 사용량을 물리지 않음. 1분 예약 → 종료 시 실제 분으로 commit 보정 |
| E-17 | Admin은 별도 Next 앱(`apps/admin`, 포트 3100) | 인증 쿠키·테이블·배포 단위 분리. 사용자 앱에 admin 문자열이 없음을 통합 테스트가 grep으로 검사 |
| E-18 | 신고 조치는 상태 전이 표 + `reports.version` | 동시 처리 시 늦은 운영자는 stale. 제한 조치는 근거 메모 필수 |
| E-19 | E2E: Next 라우트 어나운서(`__next-route-announcer__`)가 `role=alert` | `getByRole('alert')`는 항상 `.filter({hasText})`로 스코프 |
| E-20 | DB client 는 첫 사용 시 연결 (Proxy) | `next build` 의 페이지 데이터 수집이 DATABASE_URL 없이도 통과. 빌드는 DB 를 몰라야 한다 |
| E-21 | 분석 이벤트 props 는 `sanitizeProps` 를 거친다 | 관계 6차원·stage·본문·이메일 키 제거, 80자 초과 문자열 제거. 대화 내용이 분석 파이프라인에 실릴 수 없음 |
| E-22 | `observe()` 필드 타입은 원시값만 | 구조화 로그에 객체(메시지 본문 등)를 넣을 수 없게 타입으로 강제 |
| E-23 | Rate limiting 은 미구현 (R-9) | 서버리스에서 프로세스 메모리 제한은 무의미. Vercel Firewall/WAF 규칙 또는 KV 기반 카운터로 배포 시 적용 (TBD) |
| E-24 | 결제 결과는 항상 `applyPaymentEvent` 한 경로 | 실 webhook 과 Mock 시뮬레이션이 같은 함수를 탄다. 자격 로직이 둘로 갈라지지 않음 |
| E-25 | 구매 시 **현재** 사용량 창의 한도를 Pro 로 올린다 | 명세서 10.2 "결제 성공 후 Pro 사용량 적용". 한도에 막혀 결제한 사용자가 다음 창까지 기다리지 않게 |
| E-26 | webhook 중복 판정은 트랜잭션 안에서 select-먼저 | tx 안의 UNIQUE 위반은 tx 전체를 abort 하므로 catch 로 복구 불가. UNIQUE 인덱스는 동시 레이스의 안전망 |
| E-27 | 디자인 SoT = `docs/DESIGN.md`, 문장 SoT = `docs/COPY.md` + `lib/copy.ts` | 토큰은 `globals.css` `:root` 한 곳. 페이지는 inline 색값을 쓰지 않는다 |
| E-28 | Motion = `lib/motion/tokens.ts` 하나의 언어 | duration 220/440/680/1000 (등장 tween.enter = 680ms, stagger 80/120/200ms — 사용자 피드백으로 두 차례 늦춤; 눌림 90ms 는 그대로). ease.enter 는 앞을 완만하게 해 '툭 나타남' 대신 '떠오름'으로 읽히게 한다, ease standard/enter/exit, spring quick/default/gentle(전부 과감쇠). Bounce 없음. `MotionConfig reducedMotion="user"` + CSS media 로 이중 보장 |
| E-29 | 페이지 전환 = View Transition API + `html[data-nav]` 방향, 공유 요소 = `view-transition-name` | 라이브러리 없이 표준. 미지원/감소 모션이면 즉시 이동. `?now=`처럼 dev 전용 훅 없음 |
| E-30 | 캐러셀은 CSS scroll-snap, Motion 은 인디케이터(layoutId)만 | 스냅·관성·러버밴드는 플랫폼이 더 잘한다. 키보드 Tab 으로 카드 간 이동 가능 |
| E-31 | 접근성: `--color-text-tertiary` 를 #6E6E75 → #8A8A92 (3.9:1 → 5.8:1) | DESIGN.md 값에서 유일하게 벗어난 토큰. 원값은 `--color-text-quaternary` 로 장식 전용. 폼 경계는 `--color-border-input` #62626A (3.2:1) |
| E-32 | `<a>` 안에 `<button>` 금지 → `ButtonLink` | 중첩 인터랙티브는 스크린리더/키보드를 깨뜨린다. 눌림 반응은 CSS `:active` 로 동일하게 |
| E-33 | `usePress` 는 setPointerCapture 를 쓰지 않는다 | 부모 캡처가 자식 링크의 click 을 삼켰다(신고 링크·관리자 플로우 실패의 원인) |
| E-34 | 스케줄러의 `?now=` 는 판단 시각만 바꾼다; 만료·정리는 벽시계 | 자정 이후 고정 시각(14:00)이 생성 시각보다 과거가 되어 방금 만든 통화가 부재중 처리됐다 |
| E-35 | `chat/[sessionId]` 에는 `loading.tsx` 를 두지 않는다 | 스트리밍 셸이 200 을 먼저 보내 `notFound()` 의 404 가 사라진다. 삭제된 인연은 진짜 404 여야 한다 |
| E-36 | E2E 는 모바일 뷰포트(390×844) + reducedMotion | 모바일 우선 제품. 데스크톱 컨텍스트 패널 때문에 같은 텍스트가 두 곳에 보이면 `.first()` |
| E-37 | `e2e/a11y.spec.ts` — axe-core(WCAG 2.x A/AA + best-practice) 가 13개 화면을 훑고 serious/critical 0 을 게이트 | 등장 애니메이션은 Reduce Motion 에서 페이드조차 하지 않도록 바꿈(Motion 기본은 opacity 유지) — 사용자에게도, 측정에도 맞다 |
| E-38 | `--color-danger-strong` #B23A3A 는 파괴적 버튼의 채움 전용 | `--color-danger` 위 흰 글자는 3.5:1 이라 텍스트/아웃라인에만 쓴다 |
| E-39 | 인증은 소셜 로그인(Google·Naver·Kakao)만. 가입/로그인 화면을 나누지 않는다 | 유저플로우 n5~n11 의 "로그인·회원가입"을 한 화면으로: 같은 소셜 버튼이 처음이면 가입, 아니면 로그인. `(provider, providerAccountId)` 가 열쇠, 이메일은 있으면 연결 키. 삭제된 계정은 `/login?error=deleted`. 제공자 키가 없으면 `MockOAuthProvider` 가 앱 안의 동의 화면(`/auth/mock/[provider]`)으로 시뮬레이션하며 화면에 그 사실을 적는다 |
| E-40 | OAuth 는 SDK 없이 Authorization Code + state 쿠키 + PKCE(Google·Kakao) | 제공자 차이는 endpoint 와 프로필 파싱뿐이라 `OAuth2Provider` 하나로 충분하다. 관리자 콘솔은 별도 이메일·비밀번호 로그인을 유지한다 |
| E-41 | 서체는 Toss Product Sans, 폴백 Pretendard. 세리프 display 역할 제거 | 사용자 결정. `--font-display` 는 `--font-body` 를 가리키고 `.t-name`/`.t-quote` 는 자간으로만 구분한다 |
| E-42 | 로고는 원본 PNG(`public/logo-mark.png`) 를 `mix-blend-mode: screen` 으로 | 검정 판이 어두운 배경에 녹는다. Launch sequence 는 두 판 사이 사선을 `clip-path` 로 잘라 재현 |
| E-44 | 온보딩 소개 화면(유저플로우 n3/n4) 은 두지 않는다 — `/` 는 곧바로 로그인 무대 | 사용자 결정 ("굳이 이 페이지 없어도 될듯"). 로고 Launch sequence 는 로그인 화면이 품는다: 검은 무대 → 로고 → 로고가 위로 물러나며(layout spring) 소셜 버튼. `/onboarding` 은 `/login` 으로 redirect. 핵심 가치 소개 문장은 캐릭터 상세·홈이 대신한다 |
| E-43 | 등장은 `Page` 가 variant 트리의 뿌리 (`hidden`→`show`, staggerChildren 90ms, 등장 480ms). 공유 요소(PageHeader 줄·Card·Notice·Field·ToggleRow·Checkbox·Radio·Button·ButtonLink)는 `fadeUp` variants 만 들고 순서를 물려받는다 | 페이지마다 Reveal 을 끼우지 않아도 모든 화면·나중에 마운트되는 요소까지 같은 등장. `Pressable` 의 눌림은 MotionValue 로 옮겨 `animate` prop 을 비웠다 (variants 상속 조건). 컴포넌트를 거치지 않은 날것의 h1/h2/h3/p/label 은 CSS `text-in` 이 같은 부모 안에서 nth-child 순서로 받친다 (fill backwards — 끝나면 Motion 이 다시 인라인을 쥔다). Reduce Motion 이면 뿌리의 `initial=false` 가 전파되어 바로 있다 |

---

## 12. TBD

Free Limit · Pro Limit · Pro Price · LLM/Image/Voice/Video/Payment/Adult Verification Provider · Provider Weight · Data Retention Period · Event Cooldown · Relationship Delta 값 · Reality Contact 감도(motivationThreshold) · Rate limit 정책

**Provider 연결 방법**: `packages/providers/src/registry.ts` 의 `resolve*()` 에 env 분기 + Adapter 클래스 1개. Domain/서비스/UI 는 바뀌지 않는다. Mock 은 항상 `info.mode='mock'` 과 `notice` 를 노출한다.

전부 `packages/config/policy.ts`에서 `DEV_DEFAULT()` 로 표기하여 중앙 관리.
