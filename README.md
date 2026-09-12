# MIRO

AI 캐릭터 관계 시뮬레이션. 캐릭터·세계·관계·사건·NPC·기억이 하나의 지속되는 상태를 공유하고, 앱을 닫아도 캐릭터가 먼저 연락한다.

**정해진 스토리를 재생하지 않는다.** 모든 사건·연락·관계 변화는 현재 상태(관계·세계·성향·설정·시각)에서 나온다. 가입 경과일이나 턴 수만으로는 아무것도 일어나지 않으며, 이 불변식은 테스트(T1–T8)로 CI에서 게이트된다.

## 구조

```
apps/web        사용자 웹앱 (PWA, Next.js App Router)      :3000
apps/admin      운영 콘솔 — 별도 인증·배포                  :3100
packages/domain 순수 도메인 (DB·Provider 무의존)  relationship · event · memory · reality · usage · call · safety · rbac
packages/engine Simulation Orchestrator: Context → 1회 Structured Generation → Validator
packages/providers LLM / Image / Push / Call / Verification Adapter (+ Mock, 미구성 시 명시)
packages/db     Drizzle 스키마 · SQL 마이그레이션 · 시드
packages/config 모든 TBD 정책값 (`DEV_DEFAULT`)
docs/MIRO_IMPLEMENTATION_PLAN.md  아키텍처·결정·리스크·Phase 기록
```

한 턴: `loadSession → UsageGuard → buildContext → LLM(Proposal) → validateProposal → commitTurn(단일 트랜잭션, version lock)`.
LLM은 제안만 한다. 상태는 Validator를 통과한 것만 바뀐다.

## 시작

```bash
pnpm install
cp .env.example .env            # DATABASE_URL 만 있어도 전부 Mock 으로 돈다 (소셜 로그인도 앱 안 시뮬레이션 화면으로)
createdb miro_dev
pnpm db:migrate:sql && pnpm db:seed
ADMIN_SEED_EMAIL=you@x ADMIN_SEED_PASSWORD=... pnpm db:seed:admin
pnpm dev                         # web :3000
pnpm --filter @miro/admin dev    # admin :3100
```

Provider 연결은 환경변수만 바꾼다 (`.env.example`). 코드 수정은 없다. `/api/health` 가 각 Provider 의 live/mock 을 보여준다.

## 검증

```bash
pnpm typecheck
pnpm test          # vitest — 도메인 단위 + Postgres 통합 (DATABASE_URL 필요)
pnpm build
pnpm e2e           # Playwright — 두 앱을 자동으로 띄운다
```

## 스케줄러

`vercel.json` 의 Cron 이 15분마다 `/api/cron/reality` 를 `Authorization: Bearer $CRON_SECRET` 로 호출한다.
스케줄러는 "지금 판단해볼 세션"만 고르고, 연락 여부는 현재 상태가 정한다. 통화 만료와 삭제 역할극 정리도 여기서 돈다.

## 결정되지 않은 것 (Product)

Free/Pro 한도와 가격, LLM/이미지/음성/영상/성인인증/결제 Provider, 데이터 보존 기간, 사건·연락 감도. 전부 `packages/config` 에 `DEV_DEFAULT()` 로 표기되어 있다.
