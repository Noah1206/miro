# PM Status — MIRO

## 2026-09-16 무료 Gemini 검증

- 사용자 무료 티어 확인 후 합성 검증 4/4 통과, 실제 요청 6회(안전 차단 1회 포함). docs/GEMINI_FREE_VALIDATION.md 참조.
- 운영 예산 0 유지, DB 변경 없음. 독립 ai/evals/free-live.ts 추가. 장기 기억·관계·선톡 운영 검증을 완료한 것은 아님.

## 최신 CI 확인 — c9c010f

- GitHub CI 34981713979(c9c010f), 34981350698(d63c9fd) 모두 success/completed 확인. 이전 진행 중 기록을 대체한다.
- 앱 코드 미커밋 변경 없음. 출시용 제공량·차감량 사용자 결정 대기, 실제 AI/기기 Push/미디어/결제 검증은 남음. 운영 예산 0 유지.

## 2026-09-15 통화 종료 정리 수정

- LiveKit 종료에 mock 토큰을 전달하던 경로를 서버 소유권 확인된 callId 계약으로 변경. 생성한 miro-callId 방과 동일한 방 정리.
- 정리 요청 5초 제한, HTTP 오류 감지, 실패 이벤트 기록. 실 통화 연결/에이전트 구현 완료를 뜻하지 않음.
- Provider/통화 통합 테스트 14개, UTC 통화 E2E 3개, typecheck 및 두 앱 빌드 통과. 실제 Provider 호출 없음.
- CI 복구 d63c9fd 원격 검증은 점검 시 진행 중. 사용자 제공량 결정 대기.


## 2026-09-15 CI 복구 검증

- 최신 CI 34980232031는 43 통과/4 실패. UTC에서 오후 2시를 만든 테스트가 한국 시간 밤 11시로 판정되는 오류 재현. Asia/Seoul 고정 시각 헬퍼로 수정.
- 채팅 재진입 테스트는 전송 완료(입력 비워짐)를 기다린 뒤 이동하고 대화 영역을 조회하도록 수정. 초안과 메시지의 중복 텍스트 오인 제거.
- 단위/통합 393개 및 UTC 전체 E2E 47개 재시도 없이 통과, typecheck 통과. 앱 코드는 이번 단위에서 변경하지 않아 기존 빌드 사용.
- 회고/출시 문서에 확정 가격과 구독 잔액 표시, ECHO 상한 차이 정정 추가.
- 사용자 답변: 제공량은 직접 결정해 전달 예정. 실결제·실AI·운영 예산 0은 그대로. 미디어 및 실제 출시 검증은 여전히 미완료.


## 2026-09-15 · 972b071 최신 진행률 점검

- 기획 구체화 약 70%, 전체 목표 개발 약 60%, 텍스트 중심 제한 MVP 구현 약 80%, 출시 준비 약 40%로 추정. 작업 수의 확정 분모가 아닌 코드 경로·실연동·운영 검증 기준의 PM 추정이며 영상/Live/Face Cast까지 전체 범위에 포함.
- 월 9,900원과 충전 3,000/7,000/14,000원 안내, 구독 화면 실제 충전 잔액 반영 완료. 제공량·초기화 기준·충전 대상·해지 후 권한은 미정.
- 실제 코드: commit.ts에 대화/관계/기억/사용량 트랜잭션, task-router.ts에 기억 추출/요약, Reality scheduler/evaluate/outbox 구현. 운영 features.ts:39에서 Reality·사진·음성·영상·Live 강제 비활성화.
- 결제 service.ts는 production BILLING_NOT_RELEASED. 계좌이체 입금 확인/주문 대조 경로는 이번 가격 표시 변경에 포함되지 않음.
- 문서 오류: ECHO 길이 차이가 0이라는 회고 주장과 달리 현재 config는 MIRO 1024/ECHO 2048. 이는 출력 상한 차이이며 실제 응답 품질/길이 보장은 아님.
- 직전 작업 로컬 빌드와 관련 E2E 7개 통과. 393/47 전체 통과는 이전 로컬 기록이며 이번 재실행하지 않음.
- 확인한 이전 main CI 34977223640: E2E 42 통과/5 실패(ai-platform, call 2, chat, reality). 최신 972b071 CI 34980232031는 점검 시 진행 중. 실패 원인은 아직 확정하지 않음.
- 다음 순서: CI 5개 실패 재현/해소 → 미정 사용량 정책 확정 → Reality 실제 기기/모델 검증 → 결제 입금확인·지급/취소 경로 → 운영 부하/복구 검증. 운영 예산 0 유지, 실제 호출 없음.
- 이번 점검은 앱 코드·DB를 수정하지 않고 PM 기록만 갱신.


## 2026-09-15 회고 기반 최신 점검

- 기준 HEAD 15ae81a. docs/MIRO_ECHO_RETROSPECTIVE.md와 실제 코드 대조. 이번 점검은 테스트·실모델 호출을 재실행하지 않음.
- MIRO는 사용자 월간 풀 무차감, ECHO는 같은 모델에 contextScale·보조 분석 정책을 달리 적용하며 Pro 권한 필요.
- 충전소, 월간 우선/충전 후순위 원장, 모의 결제·환불 구현. 운영 판매는 BILLING_NOT_RELEASED로 차단. Stripe 충전 결제 어댑터 미구현.
- 회고 기록: 393개 테스트, 47개 E2E, 빌드 통과. 성인 인증 flaky 존재. 최신 GitHub CI는 점검 시 진행 중.
- 문서 보정: 운영 feature 함수는 이미지·통화 등을 강제 비활성화. 보조 분석도 feature 플래그가 꺼지면 ECHO에서 실행되지 않는다.
- 8턴 원가 측정은 참고 표본이며 수익성 확정 근거로 부족. 구독료 미정 상태의 ‘구독 수십 건으로 비용 충당’ 주장은 검증되지 않음.
- 다음: ECHO 효과/과금 기준 및 Free 충전 사용처 결정 → 잔액 표시·만료/환불 정책 → PG 연동 → 실결제·부하/복구 검증.
- 월간 사용자 원가/요청 상한이 있어 완전 무제한은 아님. continuation 설정을 켤 경우 소진 후 ECHO 유예 경로와 정책 정합성 재검토 필요.
- 이전 상태 기록보다 이 절을 우선한다. 앱 코드·DB·예산은 변경하지 않음.


**Last briefing**: 2026-09-15 · codex/production-readiness · 4fa7859
**Current focus**: CI pnpm 설정 충돌 해소 → 출시 전 검증. 운영 예산 0, 실제 AI 검증 보류.
**최신 보고서**: docs/PRODUCTION_PROGRESS.md / docs/PRODUCTION_RELEASE_GATES.md

## 최신 검증 상태

- 4fa7859까지 GitHub 작업 브랜치에 푸시 완료. main 병합·배포는 하지 않음.
- 로컬 단위/통합 346개, 모의 브라우저 45개, 타입 검사와 두 앱 빌드 통과.
- GitHub CI 34958067391은 pnpm 설치 단계에서 실패: workflow version 9와 packageManager pnpm@9.0.0 중복 지정. 원격 테스트는 실행되지 않음.
- 실제 AI 품질·기기 Push·실결제 검증, 신규 outbox의 운영 DB 적용, 음성/영상 등은 미완료.
- 아래는 이전 구현 이력이며 최신 상태는 위 기록과 PRODUCTION_PROGRESS.md를 우선한다.

## 제품과 확정 정책

- AI 캐릭터 관계·세계 시뮬레이션. Character/Relationship/Memory/Event/World/Scene의 상태를 Core가 유지한다.
- 사용자 최신 지시에 따라 Free/Pro는 **월간 공통 AI Usage Pool**을 사용한다. 기존 5시간 정책은 대체됨.
- 최신 요금 방향은 docs/MIRO_PRICING_POLICY.md 우선: 모델별 상품 없이 Free에서도 핵심 Reality 경험을 제공하고, Pro는 월간 공통 풀로 깊이·빈도를 확대한다. 가격·월간 한도·빈도 수치는 미정이다.
- 웹앱(PWA) 우선, 1캐릭터=1세계관. 유료 충전권/별도 기능 결제는 만들지 않는다.

## 이번 구현

- 9개 AITask 계약, Model Registry/Router, Provider 추상화·Anthropic/SLM 어댑터, bounded retry/timeout/fallback.
- 중앙 Prompt Registry·A/B, JSON 검증, Core 관계 delta 최종 결정, 계층별 기억·Top-K 검색.
- 요청 소유권·빈도·중복 방지, 대화 결과/상태/Usage 원자적 커밋, 만료 요청 정리.
- 월간 사용자 풀, 공통 가중치, Continuity opt-in, 내부 원가 사전 예약·동시 제한·시도별 로그.
- 이미지 생성 비용 제한, 사용자 사용량/동의 UI·API, 관리자 원가 집계.
- Golden 평가 runner, 독립적 학습/평가 동의, 별도 평가 샘플, 수동 검토를 전제로 한 SFT/DPO 데이터 변환, shadow/canary/rollback 기반.
- SQL 0024와 migration snapshot 추가. 실제 서비스 DB에는 미적용.

## 검증과 한계

- 격리 Postgres 전체 25 migration 적용, unit/통합 테스트, 두 앱 typecheck/build, 브라우저 E2E 검증. 최종 수치는 구현 보고서 참조.
- 유료 API/실모델 호출, 실제 배포, SLM 학습·weights·GPU 서버·상업 모델 라이선스 검토는 실행하지 않음.
- Golden reference 검사는 평가 도구의 동작 확인이며 실제 대화 품질 benchmark가 아님.
- 음성/영상 AI transport와 생성 이미지 영구 저장은 기존 후속 작업으로 남음.

## 다음 우선순위

2026-09-15 소셜 로그인 수정: 요청된 Supabase Project URL로 Auth adapter와 공개 키 설정을 연결했고, Google/카카오 실제 authorize redirect와 회귀 테스트 6개를 확인했다. 원격 DB 읽기 검사에서 users의 AI 동의 컬럼 4개가 아직 없음을 확인했다. 사용자 승인 후 지정 프로젝트에 0024를 트랜잭션으로 적용했다(Supabase migration version: 20260914150723). 누락됐던 동의 컬럼 4개, AI 내부 테이블 5개의 RLS, 실패했던 계정 조회 SQL을 확인했다. 실제 OAuth 재로그인은 사용자가 다시 시작하면 된다.

1. 0024 운영 DB 적용 완료. 실제 모델 가격·일 예산·월간 정책·기능 플래그를 설정하고 실제 로그인 재시도 확인.
2. 실제 모델과 현재 Core context를 사용해 Golden/한국어 RP·장기 기억·비용을 검증.
3. 평가/학습 동의·수동 검수·데이터 반출 및 철회 전파 운영 절차 확정.
4. Router → Memory → Dialogue 순서로 SLM 후보 benchmark 후 shadow/canary 검증.
5. 대규모 quota 집계, 미디어·통화 request gateway 통합, invoice 정산, 영구 미디어 저장을 후속 구현.

## 사용자 작업 선호

2026-09-15: 요청한 작업에 필요한 적용을 매번 다시 묻지 말고 진행할 것. 이번 0024 실제 DB 적용 승인도 포함됨.

## 2026-09-15 웹사이트 감사

- 웹 타입 검사 통과, 비DB 단위 테스트 27개 파일 / 213개 통과.
- localhost /api/health: DB up, mode production, LLM/image/voice/video/adultVerification mock, push live. 실제 전달 성공을 검증한 것은 아님.
- 통화 UI는 텍스트 입력과 정지 이미지만 사용. LiveKit token/connectUrl 브라우저 연결 누락.
- apps/web/lib/call/service.ts:98은 실 Provider에도 mock 문자열을 전달. LiveKit roomOf에서 null이 되어 방 삭제 건너뜀.
- PhotoHero 선택 인덱스가 photos 변경 시 보정되지 않아 선택한 사진 삭제 후 빈 이미지 가능.
- 취향 입력 삭제 후 parse가 빈 hobbies/dislikes를 만들고 updateCharacter가 덮어씀. 기존 취향 데이터 소실 가능.
- 기존 archived 세션은 복원 UI 제거 후에도 상태가 유지되어 active만 조회하는 선연락 스케줄러에서 제외됨.
- 약관 전문 페이지는 준비 중 안내만 구현.
- memoryExtraction/memorySummaries/llmSemanticAnalysis 플래그가 실행 서버에서 false.
- 읽기 전용 HTTP 확인: home/discover/archive/terms/privacy 200, create/my/plans 307(비로그인 요청). 인증된 전체 E2E, 실결제/실통화/유료 생성은 미실행.
- 우선순위: 실제 Provider 및 통화 연결 → 종료 오류 → 편집/사진 회귀 → 보관 잔존 상태 및 약관.


## 2026-09-15 최신 프로덕션 전환 점검

이전 항목은 당시 기록이다. 현재 상태는 이 절과 docs/P0_PROGRESS_2026-09-15.md를 따른다.

- P0 1차 검증 기록: 격리 단위/통합 328개, mock 브라우저 E2E 8개, 실제 Gemini 합성 평가 4개 통과. 이번 PM 점검에서는 재실행하지 않음.
- 현재 health: DB up, LLM live, AI_OPERATING_BUDGET_REQUIRED로 생성 차단. 기억 추출·요약 활성, 운영 Reality/이미지/음성/영상/Live Scene 비활성.
- Reality 생성에는 캐릭터·관계·사건 전달이 있지만 최근 대화와 관련 기억이 직접 입력되지 않는다. 사용자 발화 기반 선톡을 위해 공통 맥락 연결·안전 검증 필요.
- 최신 정책은 문서에 반영됐고 Pro 기억·빈도 차이 및 실제 판매는 아직 완성되지 않음.

### 차기 마일스톤 및 통과 기준 (제안)

1. 실제 모델 기반 텍스트 수직 경로: 로그인→생성→저장→재진입→기억·관계 반영. 실패·동시 요청·한도 소진 시 중복/유실/이중 차감 없음.
2. Free Reality: 관련 기억 기반 텍스트 선톡→저장→재방문→답장 맥락 연결. 중복·야간/거부 설정·탈퇴·삭제·생성/Push 실패와 재시작 검증.
3. 운영 안정화: 스테이징 분리, 자동 회귀, 부하·복구·예약 정산, 배포 롤백·알림 및 데이터 복원 훈련. 목표 지연·실패율·원가의 수치는 부하 측정 후 확정.
4. 제한적 Free 베타: 위 기준 통과와 운영 예산 확정 후 소수 초대 검증.
5. Pro: 실제 원가로 가격·한도·기억/빈도 정책 확정 후 결제/갱신/해지/환불/중복 webhook 검증.
6. 미디어: 사진→음성 메시지→음성통화→영상/Live/Face Cast 순서 제안. 각각 동일 풀·권한·안전·실패정산 검증.

### 미해결 결정

- 운영 일일 예산과 초대 사용자 규모.
- Pro 가격, Free/Pro 제공량, 기억·선톡 빈도 차이.
- 한도 소진 시 짧은 답장 유예 및 선톡 발생의 사용자 풀 차감 규칙.

앱 코드·DB·운영 예산·배포는 이 PM 점검에서 변경하지 않았다.
