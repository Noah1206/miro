# MIRO · ECHO · 충전소 — 작업 회고와 남은 일

> 2026-09-15 후속 정정: Pro 월 9,900원, 충전 3,000/7,000/14,000원, 충전 잔액 만료 없음은 확정됐다. 상품별 제공량·차감량은 사용자 결정 대기다. 아래 ‘가격 미확정’은 당시 기록이다. 실제 판매는 계속 차단한다.
>
> ECHO 출력 상한은 현재 MIRO 1024 / ECHO 2048로 다르다. 아래 ‘길이 차이가 없음’ 주장은 정정한다. 실제 답변 길이나 품질 개선이 검증됐다는 뜻은 아니다. 보조 분석은 기능 플래그가 허용할 때만 실행된다.

> 구독 화면의 충전 잔액 표시는 972b071에서 완료됐다. 아래 내용은 해당 수정 전의 회고로 보존한다.

작성일: 2026-09-15
대상: `codex/production-readiness` 의 `20e87d7` ~ `f777e40` (+ 회고 중 수정 1건)
범위: 43개 파일, +1,581 / −116 줄

`MIRO_ECHO_RECHARGE_PLAN.md` 1~6단계를 모두 구현했다. 이 문서는 그 과정에서 **무엇이
잘못됐고, 무엇이 아직 끝나지 않았는지**를 남긴다. 완료된 내용 자체는 각 단계 커밋과
`MIRO_LAUNCH_READINESS.md` 에 있다.

---

## 1. 작업 중 발견하거나 만든 문제

### 1.1 ECHO 를 별도 premium 모델로 만들었다 (내 오해 — 수정됨)

1~3단계 내내 ECHO 를 MIRO 와 **다른 모델**로 라우팅했다. premium tier 모델이 없으면
ECHO 자체를 "준비 중" 으로 막기까지 했다. 사용자가 "모델은 똑같고 사용량이 더 많아지는
것" 이라고 바로잡아 준 뒤에야 드러났다.

계획서에 "ECHO = 고급 모델" 이라고만 적혀 있었고 나는 그것을 **다른 모델**로 읽었다.
실제 의도는 **같은 모델에 더 많이 들이는 것**이었다. 애매한 한 단어를 확인하지 않고
세 단계를 쌓아 올린 대가로, `dd9ffc0` 에서 되돌리며 테스트 3개를 다시 썼다.

교훈: 제품 용어가 애매하면 코드를 쌓기 전에 묻는다. 3단계 치 작업을 되돌리는 것보다 싸다.

### 1.2 ECHO 가 배포에서 끈 기능을 되살렸다 (이 회고 중 발견 — 수정됨)

가장 심각한 결함이었다. `auxiliary: 'always'` 를 구현할 때 `planTasks` 결과에
`semantic_event` / `memory_extraction` 을 **그냥 덧붙였다.** `planTasks` 는 feature 플래그를
보고 작업을 고르는데, 내 코드는 그 판단을 건너뛰었다.

`production` 프리셋은 `llmSemanticAnalysis`, `memoryExtraction`, `memorySummaries` 가
**모두 false** 다. 즉 운영자가 끈 AI 호출을 ECHO 턴이 되살려 돌리고 있었다. 원가와
안전 양쪽에 영향을 주는 문제다.

`planTasks(input, turn, mode)` 로 옮겨 `always` 가 **규칙만 건너뛰고 플래그는 존중**하게
고쳤다. 두 방향 모두 테스트가 있다 (플래그 꺼짐 → 실행 안 함, 켜짐 → 등급 차이 발생).

교훈: 기존 판단 함수를 우회해 결과에 덧붙이는 코드는 그 함수가 지키던 규칙을 깬다.
덧붙이지 말고 그 함수 안에서 판단하게 한다.

### 1.3 무료 대화에 월간 남용 한도가 없었다 (수정됨)

2단계에서 MIRO 를 월간 차감에서 면제하면서, 남은 방어가 모두 **일·분 단위**라는 점을
그때 확인하지 않았다. 매일 초기화되므로 한 계정이 매일 하루치를 채워 월 $4.32 까지
태울 수 있었다. 6단계 원가 측정에서야 드러났고 `f777e40` 에서 월간 범위를 추가했다.

교훈: 한 층의 제한을 풀 때는 남은 층이 실제로 무엇을 막는지 그 자리에서 확인한다.

### 1.4 속도 제한 재시도에 대기가 없었다 (기존 결함 — 수정됨)

orchestrator 가 `provider_http_429` 를 받고 **즉시** 재시도해 같은 한도에 다시 걸렸다.
실패까지 312ms. 실호출을 하지 않았다면 발견하지 못했을 문제다.

### 1.5 가격이 100배로 표시됐다 (수정됨)

`priceMinor` 를 그대로 포맷해 USD 1900(=$19.00)이 `$1,900` 으로 나왔다. KRW 는 보조 단위가
없어 우연히 맞았고, 그래서 한국어 화면만 보면 끝까지 몰랐을 버그다.

교훈: "우리 통화에서는 맞다" 는 맞는 게 아니라 **운 좋게 안 틀린 것**이다.

### 1.6 `tsc -b` 가 통과시킨 오류를 Next 빌드가 잡았다

`never` 타입 narrowing 과 미등록 analytics 이벤트 두 건이 `pnpm typecheck` 를 통과하고
`next build` 에서 걸렸다. **typecheck 통과 = 빌드 통과가 아니다.**

### 1.7 2단계를 e2e 없이 푸시해 테스트 2개가 깨진 채 올라갔다

`b5d2514` 시점에 e2e 를 돌리지 않았다. `usage.spec.ts` 와 `subscription.spec.ts` 가
"소진 후 MIRO 턴이 막힌다" 를 단언하고 있었는데, 그게 바로 2단계가 바꾼 동작이다.
3단계 커밋에서야 고쳤다.

원인은 환경이었다 — `miro_test` DB 가 없어 **통합 테스트 18개 파일이 조용히 skip** 되고
있었고, e2e 도 못 돌렸다. 3단계에서 DB 를 만든 뒤에야 전부 실행됐다.

교훈: skip 은 통과가 아니다. vitest 는 `33 passed | 18 skipped` 라고 정직하게 찍지만,
초록색 숫자만 보면 그냥 통과로 읽힌다.

### 1.8 측정 도구가 스스로를 속였다

원가 측정 중 rate limit 때문에 **ECHO 가 MIRO 보다 싸게** 나왔다. 실패한 호출은 토큰을
거의 쓰지 않아 평균을 끌어내린다. 숫자만 봤으면 잘못된 결론을 문서에 남겼을 것이다.
`pnpm ai:cost` 가 실패가 있으면 경고하고 "이 수치는 과소평가" 라고 밝히도록 고쳤다.

---

## 2. 아직 끝나지 않은 일

### 2.1 판매를 열려면 — 결정이 먼저다

| 항목 | 상태 | 막고 있는 것 |
| --- | --- | --- |
| 충전 상품 가격·제공량·유효기간 | ❌ | **제품 결정.** `MIRO_RECHARGE_PRODUCTS` 가 비어 있어 아무것도 팔지 않는다 |
| 실 PG 어댑터 | ❌ | `createRechargeCheckout` 은 **mock 에만** 구현돼 있다. `stripe.ts` 에 없다 |
| Pro 월 구독료 | ❌ | 제품 결정 (`POLICY.subscription.priceLabel` 은 여전히 `'TBD'`) |
| ECHO 등급 배수 확정 | ⚠ | 현재 contextScale 2 / maxOutputTokens 2048 은 임시값 |

값이 정해지면 코드는 이미 받을 준비가 돼 있다 — 카탈로그 env 를 채우고 PG 어댑터에
`createRechargeCheckout` 을 구현하면 된다. 프로덕션 판매 차단(`BILLING_NOT_RELEASED`)을
푸는 건 그 다음이다.

### 2.2 구현이 남은 것

**만료된 충전 잔액을 정리하지 않는다.** 조회할 때 제외만 하고 행은 영원히 남는다.
계획서가 "유효기간과 만료 시 복구 정책은 확정 후 구현" 으로 미뤄둔 부분이라 의도적으로
비워뒀지만, 유효기간 있는 상품을 팔기 시작하면 정리 작업이 필요하다.

**ECHO 응답 길이가 실제로는 늘지 않는다.** `POLICY.chatTier.echo.maxOutputTokens` 는
2048 인데 registry 모델의 `maxOutputTokens` 도 2048 이라 상한에 붙어 있다. orchestrator 가
둘 중 작은 값을 쓰므로 **지금은 MIRO 와 차이가 없다.** 셋 중 실제로 작동하는 차별점은
맥락 확대와 보조 분석 둘뿐이다. 모델 설정도 같이 올려야 한다.

**충전 잔액이 `/my/subscription` 에는 안 보인다.** `/recharge` 에만 있다. 잔액이 실제로
생기기 시작하면 요금제 화면에도 필요하다.

**Free 사용자가 충전 잔액을 쓸 곳이 사실상 없다.** ECHO 는 Pro 전용이고, 사진·통화는
`production` 프리셋에서 켜져 있지만 ECHO 만큼 검증하지 않았다. 계획서는 "Free 도 추가
인터랙션용 사용량을 구매할 수 있게 한다" 고 했으므로, 팔기 전에 Free 가 무엇에 쓸 수
있는지 확정해야 한다.

### 2.3 검증이 남은 것

**부하·모니터링·복구.** Gemini 무료 등급의 분당 한도에 먼저 걸려 의미 있는 수치를 낼 수
없다. 유료 키가 필요하다.

**실결제 경로.** 결제 검증은 전부 mock provider 로만 했다. 실 PG 의 webhook 서명, 재전송,
지연, 부분 환불은 어댑터가 생긴 뒤에 다시 봐야 한다.

**원가 재측정 조건.** 현재 수치($0.00216/턴)는 `gemini-3.5-flash-lite` 기준이다. 모델이나
단가가 바뀌면 `pnpm ai:cost` 로 다시 잰다. 측정은 한 캐릭터·한 세션 기준이라 세션이 많은
사용자는 더 들 수 있다.

### 2.4 알아둘 것

**알파 경로(`/api/chat`)는 항상 MIRO 다.** `chatModel` 을 넘기지 않아 무조건 무차감
기본 대화로 동작한다. 알파에 ECHO 를 노출할 계획이라면 명시적으로 넘겨야 한다.

**mock provider 는 원가가 항상 0** 이라 원가 상한이 절대 걸리지 않는다. 개발·테스트
환경에서 실제로 막는 것은 요청 수 상한뿐이다.

**월간 예산 카운터는 40일짜리다.** 기본 2일 청소 주기에 쓸려가면 한도가 달 중간에
초기화된다. `maintenance.ts` 의 정리 주기를 만질 때 이 점을 깨지 않도록 한다.

---

## 3. 현재 검증 상태

| | |
| --- | --- |
| 단위·통합 테스트 | 51개 파일 **393개 통과** (skip 0) |
| E2E | **47개 통과** (모바일 뷰포트 390×844) |
| typecheck / 빌드 | 통과 |
| 실모델 호출 | MIRO·ECHO 각 1턴 + 8턴 연속 원가 측정 |
| 운영 DB | **건드리지 않음** — `miro_test`, `miro_migrate_test` 에서만 검증 |

알려진 flaky: `ops.spec.ts` 의 성인인증 테스트. 단독 실행에서도 재시도 후 통과하며
이번 작업과 무관한 기존 문제다.

### 테스트 환경 재현

```
createdb miro_test
psql -d postgres -c "create role anon nologin; create role authenticated nologin; create role service_role nologin"
DATABASE_URL="postgresql://$USER@localhost:5432/miro_test" pnpm db:migrate:sql
DATABASE_URL="..." pnpm db:seed
DATABASE_URL="..." ADMIN_SEED_EMAIL='e2e-admin@miro.dev' ADMIN_SEED_PASSWORD='admin-pass-123' ADMIN_SEED_ROLE='superadmin' pnpm db:seed:admin

export TEST_DATABASE_URL="postgresql://$USER@localhost:5432/miro_test"
pnpm test && pnpm e2e
```

`TEST_DATABASE_URL` 없이 `pnpm test` 를 돌리면 통합 테스트 18개 파일이 **조용히 skip 된다.**
