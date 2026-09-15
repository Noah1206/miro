# MIRO

AI 캐릭터 관계 시뮬레이션. 캐릭터·세계·관계·사건·NPC·기억이 하나의 지속되는 상태를 공유하고, 앱을 닫아도 캐릭터가 먼저 연락한다.

2026-09-14 AI Platform 변경: Free/Pro는 **월간 공통 사용량**을 쓰며 동일한 모델 라우팅 정책을 적용한다. 구현 범위, 운영 설정, 검증 결과, 미구현 항목은 [AI Platform 보고서](docs/MIRO_AI_PLATFORM.md)를 기준으로 확인한다.

**정해진 스토리를 재생하지 않는다.** 모든 사건·연락·관계 변화는 현재 상태(관계·세계·성향·설정·시각)에서 나온다. 가입 경과일이나 턴 수만으로는 아무것도 일어나지 않으며, 이 불변식은 테스트(T1–T8)로 CI에서 게이트된다.

## 구조

```
apps/web        사용자 웹앱 (PWA, Next.js App Router)      :3000
apps/admin      운영 콘솔 — 별도 인증·배포                  :3100
packages/domain 순수 도메인 (DB·Provider 무의존)  relationship · event · memory · reality · usage · call · safety · rbac
packages/engine Simulation Orchestrator: Core Rules → Context → Task별 Structured Generation → Validator
packages/providers LLM / Image / Push / Call / Verification Adapter (+ Mock, 미구성 시 명시)
packages/db     Drizzle 스키마 · SQL 마이그레이션 · 시드
packages/config 모든 TBD 정책값 (`DEV_DEFAULT`)
ai/evals        합성 Golden Dataset · Prompt/Model 비교 실행기
docs/MIRO_IMPLEMENTATION_PLAN.md  아키텍처·결정·리스크·Phase 기록
```

한 턴: `RequestGateway → Monthly Usage 예약 → Context/Core → Task/Model Router → Budget 예약 → Adapter → Validator → commitTurn`.
관계 변화는 Core 규칙이 결정하고, 나머지 AI 제안은 검증 후 저장한다. 요청 결과·대화 상태·사용량을 같은 트랜잭션으로 확정한다.

## 시작

```bash
pnpm install
cp .env.example .env            # DATABASE_URL 만 있어도 전부 Mock 으로 돈다 (소셜 로그인도 앱 안 시뮬레이션 화면으로)
createdb miro_dev
pnpm db:migrate:sql
ADMIN_SEED_EMAIL=you@x ADMIN_SEED_PASSWORD=... pnpm db:seed:admin
pnpm dev                         # web :3000
pnpm --filter @miro/admin dev    # admin :3100
```

Provider 연결은 환경변수만 바꾼다 (`.env.example`). 코드 수정은 없다. `/api/health` 가 각 Provider 의 live/mock 을 보여준다.

소셜 로그인을 Supabase Auth로 운영할 때는 `AUTH_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 설정한다. Google/카카오 키는 Supabase 대시보드에서 관리한다. 소셜 제공자의 callback은 `<Project URL>/auth/v1/callback`, Supabase의 앱 Redirect URL은 `http://localhost:3000/api/auth/**` 및 실제 서비스 도메인의 callback 경로를 허용한다. 인증은 PKCE로 확인한 뒤 기존 Miro 계정·세션에 연결한다. 공개 키를 사용하며 service_role 키는 인증에 사용하지 않는다. 웹 서버는 저장소 루트 `.env`도 읽고, 배포 환경변수가 있으면 그 값을 우선한다.

## 검증

```bash
pnpm typecheck
pnpm test          # 단위 테스트. 통합 테스트는 로컬 TEST_DATABASE_URL을 지정한 경우에만 실행
pnpm build
pnpm e2e           # 로컬 TEST_DATABASE_URL 필수, 별도 포트 3200/3300에서 실행
pnpm ai:eval       # 합성 reference fixture로 평가 실행기 검증. 실제 모델 평가는 --live + 명시적 예산 필요
```

테스트 DB는 `miro_test`처럼 이름에 `_test` 접미사를 붙인 로컬 DB를 사용합니다. `TEST_DATABASE_URL=postgres://localhost/miro_test`를 지정하고, 해당 DB에만 마이그레이션과 `db:seed`를 실행하세요. 기본 캐릭터 시드는 테스트 DB에서만 실행되며, E2E는 실행 중인 사용자 서버를 재사용하지 않습니다.

## 스케줄러

`vercel.json` 의 Cron 이 15분마다 `/api/cron/reality` 를 `Authorization: Bearer $CRON_SECRET` 로 호출한다.
스케줄러는 "지금 판단해볼 세션"만 고르고, 연락 여부는 현재 상태가 정한다. 통화 만료와 삭제 역할극 정리도 여기서 돈다.

## 결정되지 않은 것 (Product)

Free/Pro 한도와 가격, 실제 운영 Provider, 학습 데이터의 수동 검수·보존 정책, 사건·연락 감도는 운영 확정이 필요하다. `MIRO_USAGE_POLICY`, `MIRO_BUDGET_POLICY`, `MIRO_MODEL_REGISTRY`로 정책을 설정한다. 월간 100/1000은 개발 기본값이며 실모델 비용·가격을 검증한 수치가 아니다.
