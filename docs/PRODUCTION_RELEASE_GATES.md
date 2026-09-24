# Miro production release gates

2026-09-15. Implementation and release are separate. The user deferred live AI validation and kept operating budget at zero. No live test, public deployment, real checkout or media activation is approved by a passing mock suite.

## Environments

- Local/CI tests: explicitly named local `*_test` database, mock providers, isolated ports 3200/3300. Never seed the shared user database.
- Staging: separate database, provider credentials and host. Do not reuse user data without a separate approved process.
- Production: no mock entitlements/providers, server-only secrets, measured budgets. New Reality/outbox code requires migration before activation.

## Before enabling Free beta

- [ ] Real browser login → real AI reply → save → reload passes, including failure and retry.
- [ ] Long multi-character conversations pass the agreed memory/correction/relationship rubric.
- [ ] Memory-grounded proactive messages pass live input/output safety and relevance checks.
- [ ] Actual Push delivery verified on supported devices (Android Chrome, iOS home-screen app, desktop), with browser-permission denial and revisit checks. There is no in-app opt-out or quiet-hours setting since 2026-09-24; night silence comes from each character's active hours.
- [ ] Daily operating budget and invitation size explicitly set; current budget remains zero.
- [ ] Concurrent load test meets agreed error, latency and cost targets. Targets must be measured and agreed, not assumed.
- [ ] Database backup restored into an isolated environment and record integrity checked.
- [ ] Privacy/deletion/retention behavior matches user-facing documents.
- [ ] Monitoring alerts reach an operator, including provider failure and budget exhaustion.

## Deployment order

1. Back up and record current app revision and migration state.
2. Validate new migrations against a fresh test database and a staging copy using synthetic data.
3. Apply only pending migrations to staging, then validate permissions and app queries.
4. Deploy app to staging and run smoke/critical E2E without production credentials.
5. For production rollout, apply pending additive migration first; do not replay the fresh-database `db:migrate:sql` script against an existing production database.
6. Deploy with unvalidated features disabled. Check health, auth, reads, errors, usage reservations and notification queue.
7. Enable features only after the corresponding gate is passed. No feature is enabled by this document.

## Recovery runbook

- Provider outage/budget exhaustion: stop new generation, retain conversations; do not turn on mock responses as production fallback.
- Interrupted chat: `maintainAI` fails expired pending requests and refunds reserved user usage atomically. Completed requests are not refunded. Provider cost reservations are separate.
- Push outage: persistent jobs retry with bounded attempts. Expired leases recover; stable tags collapse repeated notifications. Device delivery remains at-least-once, not exactly-once.
- Outbox failure: inspect pending/sending/failed counts and attempts via server-authorized DB access. Do not log raw subscriptions, private text or credentials.
- App regression: return to the recorded previous compatible app revision. Keep additive tables; do not delete user data as rollback.
- Suspected access leak: disable affected endpoint/feature, preserve restricted audit metadata, investigate scope before recovery.

## Pro and media gates

Pro requires explicit price, pool size and depth/frequency settings plus real purchase/renewal/cancellation/refund/out-of-order webhook validation. No numeric product decisions are inferred.

Photo, voice message, call, video, Live Scene and Face Cast each require a working provider, permission/safety checks, saved results, bounded costs and failure recovery. A mock adapter or UI does not pass a release gate.

### 음성통화 (2026-09-24 검증 중)

- 실측으로 찾은 결함: 임시 토큰 요청이 SDK 이름(`liveConnectConstraints`)이라 REST 가 400 을 냈고, 웹소켓이 `BidiGenerateContent` 라 임시 토큰을 1008 로 거절했다 — 운영에서 켰어도 항상 텍스트 통화로 떨어졌을 것이다. `bidiGenerateContentSetup` + `BidiGenerateContentConstrained` 로 고쳤다(토큰에 모델·지시문·보이스가 잠기고 브라우저 setup 은 무시된다).
- 통화 지시문에 채팅용 JSON 계약·상태 변화 제안이 섞여 있었고, 관계·장소·기억·최근 대화가 빠져 있었다 → `buildSpokenSystem`.
- 생각을 끄면(`thinkingBudget: 0`) 말을 건 뒤 첫 목소리 0.6초. `thinkingLevel` 은 이 모델이 거부한다.
- 브라우저: 기기 샘플레이트로 받아 16kHz 로 줄이고, iOS 에서 소리가 막히면 '소리 켜기'로 깨우고, 말을 끊으면 예약된 음성을 멈춘다. 화면이 다시 그려져도 다시 연결하지 않는다.
- 요금: 종료 버튼 없이 떠나면 브라우저가 종료 신호(`/api/calls/[id]/end`)를 보내 실제 시간으로 끝낸다. 신호가 끝내 없으면 정리 크론이 30분이 아니라 예약한 1분만 청구한다.
- 공개 순서: `MIRO_VOICE_CALL_USERS` 계정만 사용자가 거는 통화를 먼저 연다 → 사람이 실제 기기(안드로이드 크롬·아이폰 홈 화면 앱)로 통화 확인 → 차단 목록에서 `voiceCall` 을 빼 전체 공개(그때 캐릭터가 거는 통화도 열린다).
- 기억: 토큰에 두 사람의 받아쓰기를 켜고(`inputAudioTranscription`·`outputAudioTranscription`), 브라우저가 턴마다 순서대로 `/api/calls/[id]/turns` 로 보낸다. 서버는 대사를 새로 만들지 않고(`runTurn` 의 `spokenReply`) 채팅 턴과 같은 파이프라인으로 입력·출력 검열, 관계, 기억, 사건 규칙을 돌려 대화 기록에 남긴다. 검열에 걸린 턴은 남기지 않는다. 끊은 직후 2분 안에 온 마지막 턴까지 받는다. 실측: 합성 한국어 음성을 16kHz 로 흘렸을 때 받아쓰기 "내일 저녁에 공방에 다시 들를게요." 그대로.
- 목소리: 캐릭터 성별로 정한다(남성 Alnilam, 여성 Kore — `GENDER_PRESETS`). 전에는 모두 Kore(여성)라 운영 캐릭터 2명(둘 다 남성)이 여성 목소리로 통화했을 것이다. 같은 문장 실측 기본 주파수 중앙값 123Hz / 240Hz, 받아쓰기는 원문 그대로. 성별이 없으면 `GEMINI_LIVE_VOICE`(기본 Kore). 만들 때 고르는 칸은 다음 단계.
- 남은 한계: 음성 출력은 소리로 나가기 전에는 우리 검열을 거치지 않는다(모델 안전 설정과 지시문에 의존, 저장만 검열). 비용은 분당 약 $0.023(입력 $0.005 + 출력 $0.018, 2026-09-19 가격표 기준)에 음성 턴마다 검열·분류 약 $0.001.

## Evidence for this development pass

See `PRODUCTION_PROGRESS.md` for actual test results and pushed units. Unit/mock E2E success does not establish real AI quality, live payment correctness or production capacity.
