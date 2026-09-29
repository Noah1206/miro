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
- [x] Monitoring alerts reach an operator, including provider failure and budget exhaustion. **2026-09-29:** 유지보수 크론(15분)이 `lib/ops/alerts.ts` 로 DB 기록을 보고 Discord 웹훅(`MIRO_OPS_DISCORD_WEBHOOK`)에 보낸다 — AI 제공자 장애 의심(15분 안 실패 절반 이상), 일일 예산·호출 한도 80%/소진, 24시간 넘은 입금 대기, 푸시 실패 누적. 같은 알림은 6시간에 한 번(`ops_alerts` 표). 웹훅을 처음 본 뒤 '연결됨' 인사를 한 번 보낸다. 받는 사람은 운영자뿐이다. 대시보드·오류 추적 도구는 아직 없다.

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

### 음성통화 (2026-09-24 검증 중 → 2026-09-29 문자 통화로 전체 공개)

- **2026-09-29:** Gemini 목소리가 불합격이라 실시간 음성은 계속 닫고(`voiceCallAudio` 운영 차단), 통화 자체는 문자 통화로 모두에게 열었다 — `voiceCall` 을 차단 목록에서 뺐다. 사용자가 거는 통화와 캐릭터가 거는 통화 모두 문자로 진행되고, 과금은 분당 5 크레딧 그대로. 수신 벨 폴링(탭마다 8초)이 운영에서 돈다. `MIRO_VOICE_CALL_USERS` 는 플래그를 다시 끌 때의 허용 목록으로만 남는다.

- 실측으로 찾은 결함: 임시 토큰 요청이 SDK 이름(`liveConnectConstraints`)이라 REST 가 400 을 냈고, 웹소켓이 `BidiGenerateContent` 라 임시 토큰을 1008 로 거절했다 — 운영에서 켰어도 항상 텍스트 통화로 떨어졌을 것이다. `bidiGenerateContentSetup` + `BidiGenerateContentConstrained` 로 고쳤다(토큰에 모델·지시문·보이스가 잠기고 브라우저 setup 은 무시된다).
- 통화 지시문에 채팅용 JSON 계약·상태 변화 제안이 섞여 있었고, 관계·장소·기억·최근 대화가 빠져 있었다 → `buildSpokenSystem`.
- 생각을 끄면(`thinkingBudget: 0`) 말을 건 뒤 첫 목소리 0.6초. `thinkingLevel` 은 이 모델이 거부한다.
- 브라우저: 기기 샘플레이트로 받아 16kHz 로 줄이고, iOS 에서 소리가 막히면 '소리 켜기'로 깨우고, 말을 끊으면 예약된 음성을 멈춘다. 화면이 다시 그려져도 다시 연결하지 않는다.
- 요금: 종료 버튼 없이 떠나면 브라우저가 종료 신호(`/api/calls/[id]/end`)를 보내 실제 시간으로 끝낸다. 신호가 끝내 없으면 정리 크론이 30분이 아니라 예약한 1분만 청구한다.
- 공개 순서: `MIRO_VOICE_CALL_USERS` 계정만 사용자가 거는 통화를 먼저 연다 → 사람이 실제 기기(안드로이드 크롬·아이폰 홈 화면 앱)로 통화 확인 → 차단 목록에서 `voiceCall` 을 빼 전체 공개(그때 캐릭터가 거는 통화도 열린다).
- 기억: 토큰에 두 사람의 받아쓰기를 켜고(`inputAudioTranscription`·`outputAudioTranscription`), 브라우저가 턴마다 순서대로 `/api/calls/[id]/turns` 로 보낸다. 서버는 대사를 새로 만들지 않고(`runTurn` 의 `spokenReply`) 채팅 턴과 같은 파이프라인으로 입력·출력 검열, 관계, 기억, 사건 규칙을 돌려 대화 기록에 남긴다. 검열에 걸린 턴은 남기지 않는다. 끊은 직후 2분 안에 온 마지막 턴까지 받는다. 실측: 합성 한국어 음성을 16kHz 로 흘렸을 때 받아쓰기 "내일 저녁에 공방에 다시 들를게요." 그대로.
- 목소리: 캐릭터 성별로 정한다(남성 Alnilam, 여성 Kore — `GENDER_PRESETS`). 전에는 모두 Kore(여성)라 운영 캐릭터 2명(둘 다 남성)이 여성 목소리로 통화했을 것이다. 같은 문장 실측 기본 주파수 중앙값 123Hz / 240Hz, 받아쓰기는 원문 그대로. 성별이 없으면 `GEMINI_LIVE_VOICE`(기본 Kore). 만들 때 고르는 칸은 다음 단계.
- 남은 한계: 음성 출력은 소리로 나가기 전에는 우리 검열을 거치지 않는다(모델 안전 설정과 지시문에 의존, 저장만 검열). 비용은 분당 약 $0.023(입력 $0.005 + 출력 $0.018, 2026-09-19 가격표 기준)에 음성 턴마다 검열·분류 약 $0.001.

### 공식 보이스 (2026-09-25 구현, 엔진 점검만 실측)

- 등록은 운영자만: `/miro-voice-import` 스킬 → `pnpm voice …`(`tooling/voice/import.ts`). 제작자 녹음 업로드 경로는 없고, 제작자는 만들기 폼 '목소리'에서 활성 공식 보이스만 고른다(없으면 칸이 안 보인다).
- 엔진은 무료·로컬: 목소리 복제와 미리 듣기는 Chatterbox Multilingual(chatterbox-tts 0.1.7, 가중치 MIT, Hugging Face 리비전 고정), 전사는 Whisper small. 운영자 Mac 에서만 돌고 녹음·목소리 파일은 밖으로 나가지 않는다. 준비에 디스크 약 5GB 가 든다.
- 라이브러리 `official_voices` + `characters.voice_id` — 마이그레이션 `20260925120000_official_voices.sql` 은 2026-09-28 메인 병합 전에 운영에 적용했다. 등록 보이스는 0개이며 RLS 활성화, anon/authenticated 직접 조회 불가를 확인했다. 다른 환경도 `characters` 전체 select 가 새 칸을 읽으므로 **배포 전에** 적용한다. `provider_voice_id` 는 목소리 파일(Chatterbox Conditionals)의 sha256 이다.
- 연결 한계: 운영(Vercel)에는 이 모델을 돌릴 곳이 없다. 라이브러리에 넣어도 앱에서 소리로 나오는 곳은 없다(통화는 여전히 Gemini Live 목소리). 운영에서 들려주려면 추론 서버(유료 GPU 등)나 다른 엔진을 따로 정해야 한다.
- 엔진 점검 실측(2026-09-25, 모델 내장 기본 목소리 — 공식 보이스 아님): M2 8GB·MPS, 재부팅 뒤 다른 앱 없이 `pnpm voice` 전 과정. 모델 로드 약 25초, 목소리 파일 만들기 23초, 대사 3개 생성 86·48·42초(음성 5.5·4.6·4.7초), 최대 메모리 사용 11.4GB(스왑 사용). 앱이 많이 떠 있을 때는 44초/토큰으로 사실상 멈췄다. 실제 녹음 등록·운영자 청취 승인은 아직.

### 문자 페이지·생활 리듬 (2026-09-26 배포)

- **순서: 마이그레이션 먼저.** `20260926140000_contact_routine.sql`(contact_profiles.routine 추가)이 없으면 contact_profiles 를 읽는 모든 곳(미로 채팅·문자·통화·홈·스케줄러)이 `column "routine" does not exist` 로 500 이 난다. 추가 컬럼이라 코드보다 먼저 적용해도 안전하다.
- 미로 캐릭터의 문자는 `/messages/[sessionId]`, 만나서 나누는 장면은 `/chat` — 메시지 kind(`messenger`·`reality_message`·`call_record`)로 나뉜다. DB 에 kind/status CHECK 제약은 없다(운영 확인).
- 생활 리듬은 캐릭터당 한 번 dialogue 모델로 만든다(운영 레지스트리에 world_update 담당 모델이 없다). 실패하면 활동 시간 밖=수면 기본 리듬을 저장하고 24시간 뒤 다시 시도한다. 화면·턴은 기다리지 않는다.
- 운영은 통화 기능이 꺼져 있어 수신 벨 폴링(`/api/calls/ringing`)도 돌지 않는다. 통화를 열면 탭마다 8초 간격 조회가 생긴다.
- 배포 전 검토에서 고친 것: 미뤄진 문자가 요청을 'pending' 으로 남겨 15분간 세션을 막던 문제, 늦은 답장이 동기 검사에 걸려 영영 안 나가던 문제, 같은 날 같은 사유의 예약 연락이 매 크론마다 모델을 부르던 문제(중복 키를 모델 호출 전에 확인).

## Evidence for this development pass

See `PRODUCTION_PROGRESS.md` for actual test results and pushed units. Unit/mock E2E success does not establish real AI quality, live payment correctness or production capacity.
