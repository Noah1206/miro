# 2026-10-26 최신 요청: 음성 출시 보류, 리얼리티 중심 진행

- 사용자: 음성은 나중에 학습 마무리 후 재개. 기존 리얼리티 인터랙션 중심으로 진행.
- characterVoice 기능 플래그 추가(로컬/운영 기본false, MIRO_FEATURE_CHARACTER_VOICE). 채팅방 음성 모드·잔여량·구매·마이크, 만들기/편집 음성 선택 숨김. 이전 ON localStorage가 있어도 복구 안 됨. 기존 voiceId/media 저장값은 숨김 필드로 보존.
- APItts404, 초체험/구매차단, 워커dispatch차단. 대기취소/반환은 열어둠. 이 로컬앱 전용 test speech worker4002/4014 종료확인. 클라우드훈련/추론실행없음. 원본/가중치/구현/초잔액 삭제없음.
- CUA 실제앱에서 음성패널/모드그룹 없음, 페르소나/디자인/문자이동 유지. 문자페이지 전환·테스트문자 전송 저장 확인(mockAI/독립DB). 실제 운영 메시지/알림 발송 아님.
- 집중TS35개/전체typecheck통과. 증거 defer-voice-tests.log, defer-voice-typecheck.log, voice-deferred-menu.png, VOICE_DEFERRED.json. README/음성출시계획 현재범위 갱신.
- 운영배포 아직안함. 음성과금운영DB/실모델품질/실원가는 이번출시게이트에서 제외하고 후속재개 목록으로 보존. 실제이미지클라우드/실기기검증이 완료됐다고 주장하지 않음.

---

# 2026-10-26 음성 캐릭터챗 구현·로컬 앱 검증 (운영 미배포)

- 자동 합성 제거, 최대3개 대사 선택·음성모드 잔여초·빨간 차감/X·실패/다시듣기 UI 구현. 보통40자10초/길게80자20초는 같은 모델 품질. 서술/분위기/NPC 제외.
- 초 원장/예약/실제WAV올림정산/실패·불명확 반환/구매 충전금 전용 구매/중복방지 구현. 캐시 만료 순간 무료 재생이 유료 생성으로 바뀌지 않도록 reuseOnly 보호. SQL20261026094906은 로컬만 적용. flags 기본off/상품[] 유지.
- 상황 에셋 명시메타데이터 우선/없으면 사용자 버튼 생성/대화 저장/일반·언베일 공급자 분리. 운영 갤러리 전체 분류나 실제 이미지 모델 출력 검증은 아직 아님.
- CUA로 localhost8812 실제 앱 검증: 선택만으로 생성0, 차감X,0.2초 테스트톤 재생, 캐시 추가차감0, 구매150충전미로→60초, 실패10초예약전액반환, 대기취소20초반환(53→73), 새로고침/모드전환, 좁고 낮은뷰포트입력란확인. 실기기키보드아님. 모든 로컬fake공급자/전용testDB, 실제모델음성아님.
- 집중TS32/Python5/전체타입검사 통과. 기존넓은테스트12실패는 수정전guard로도동일재현. 전체green표현금지.
- ModalUsage Paused/139.94net/163.07동결한도 재확인. 최신13fullFT보존, 독립reload/native/새생성/실원가 미완. 이전승인잔액이외추가지출·결제·훈련·새서버·운영배포 없음. 출력별ASR완주검사 미구현이라판매활성화게이트유지.
- docs/VOICE_CHARACTER_CHAT_RELEASE_PLAN.md 최신실행결과/남은출시순서로 갱신. 증거 output/voice-character-launch-20261026. 기존코드의 사용자CSS편집과 원본·가중치 보존.

---

# 2026-10-26 18:36 KST 음성 캐릭터챗 출시 범위·게이트 점검

- 사용자 정체성 확정: 음성 캐릭터챗. 오디오드라마 명명 금지. 일반/언베일 음성과 상황 이미지가 초기 핵심이며 언베일 음성을 후순위로 내리지 않는다. 이미지 기존 에셋 우선/사용자 요청 새 생성, 제한된 유료 음성으로 검증.
- 실제 코드 읽기 점검: immersive.tsx는 모드 ON 뒤 새 답 자동 합성/재생, speech queue 비용 예약은 사용자 구매 음성 분량/환불 아님. production imageGeneration 강제차단 존재. 상황별 generatedMedia cache는 있지만 운영자 기존 에셋 전체 매칭 통합 검증 아님. 이번에는 UI/서비스 기능을 바꾸거나 테스트/배포하지 않음.
- docs/VOICE_CHARACTER_CHAT_RELEASE_PLAN.md에 6단계/완료기준 저장, README 첫 정체성을 음성 캐릭터챗으로 수정. 목표는 비용상한·정산·실기기 검증을 거친 제한된 유료 베타. 최신13 모델 독립reload/native/새오디오 우선, 새 학습 먼저 하지 않음.
- 약432886853200bytes 이전 manifest 준비됨: output/voice-upload/male-asmr-01-20261026/breath-aware-v2/migration-preparation/TRANSFER_MANIFEST.json. 32개 전체 checkpoint430824909008bytes 크기 재검증, 479319byte model_state에서886파라미터형상 확인. 가중치 전체 다운로드/이전/엔진재로드는 아님. B2 월 약2.94USD 보관은 추론 서버비 별도. 새 이전비최대3/보관월최대3.5 승인대기 유지, 일반 진행 요청을 신규 금액 승인으로 보지 않음.
- 무료15초/100명/5천원5분은 제안이지 확정 판매 정책 아님. 기존 가입 보상1000토큰에 음성을 자동 연결하지 않는다. 장기 원가 계산은 기존 출력 속도/Runpod가격/예산환율1500 시나리오이며 새13실측 아님.
- 이번 새 유료 호출·결제·서버임대·학습·운영배포 없음. Mac디스크 부족으로 재다운로드 가능한 PANNs cache327428481bytes만 정리, provenance/download script/원본녹음/결과/가중치 보존.

---

# 2026-10-26 남성13 FullFT 저장완료·누적100달러 결제실패로 비교차단

- 실제13updates(204unique+4replay),1041.59slearning. beforeheldout57loss5.190513→after5.171079(-.3744%). fullcheckpoint32files430824909008bytes,Volumecommitack step13 time1793004475.86674/commit337.83s. 무료SDK로32파일크기다시검증. 새13가중치안잃었음. 학습 재실행금지, 새오디오/독립엔진reload 아직미완.
- Modal현재Paused. Stripe10/26누적사용료100USD실패,10/23 20+10USD결제됨UI확인. 이번실행추가100달러아님. 자체4앱postedcompute19.29954619스냅샷,사용자39new/65male/163.07workspace한도유지. failedverify app ap-e1epiFlevWZViWSPH56FDv는함수진입전차단VERIFY_STARTED없음,paidresource0. 현재GPU0/appliststopped. 본13학습app ap-BgVgm6khBuqz4kNTPkilkf 종료.
- 최신사용자질문 돈지금안내면어떻게돼. 즉시학습가중치삭제된상태아님, 현재읽기확인. 공식security Volume persistent until deleted. 미납상태특별보관기한보장찾지못함. 저장료정지중에도별도. Terms2.2연체이자가능. 결제화면Brave billingTab Stripe포털markHandoff,invoice100failed만crop modal-invoice-100-failed.png,스크린샷사용자표시. 기존승인수령후새추가승인재질문하지않음,계정복구는사용자필요.
- 최소보관료위해 이번native-source23중복73,691,602,702bytes만무료SDK정리. warmstart-provenance작은파일cloud/local보존. 새13와기존23/male10full+native/5native파일목록·크기전후같음. 현재1,416GiB가한달유지시보관약35.3USD/month추정(새native추후추가시약41.5),삭제청구반영최대4일. 다른보호대상삭제금지. 녹음보존.
- 복구되면 tooling/voice/modal_drama3_breath_stage.py verify_after_billing→export_new→listen 승인내가능. 해당controller는verify_only일때정리된source23native검사생략,실제breath_stage_train10파일hash변경없음. run_remaining.py 위3단계만진행하도록준비,현재실행중아님. verify_after_billing_result를verify_result별칭저장. noautoretry/exclusivephase기록. 모든실패취소포함남은작업상한COST_RECEIPT39미만. 기존paid-stage-v1 $30auth불변.
- 보고서 http://127.0.0.1:8814/breath-aware-v2/index.html 는학습저장완료/비교아직미생성정직표시. 나중에 collect.py→audit.py(asr-runtime)→package.py로진짜3arm듣기비교. source23/male10기존2대사 WAV동일ref/seed4321/1,.9,4097재사용. 새learned13만2H100출력. 아직quality개선선언불가. currentnew scope추가학습13외자동추가금지.

---

# 2026-10-26 숨 보존 남성204개13업데이트 완료·저장 중

- 실제newstage13updates/208presentations(204unique+4replay) 끝남. learning1041.59s, beforeheldout57 loss5.190513. 아직after평가/새complete/클라우드commit/독립freshreload/native/비교완료아님. 35.9B FullFT, codec고정, KoreanHuBERTauxiliary 유지. 기존23/male10/5보존.
- 현재본학습app ap-BgVgm6khBuqz4kNTPkilkf, pod ta-01M5VMMNGMTVCKKZQKBP3JVZVR. local log breath-aware-v2/train_checked_recovery.log. supervisorOS unifiedsession82716 run_remaining.py가 이본실행→verify→export_new→listen 순서로승인내실행. 반복재시도금지, preemption로그감지시해당app즉시stop.
- 처음8H100app ap-Pf2VCdZouALg096mZ3EIWQ는 모델construct전cachevalidation시Modalpreemption,0updates,명시stop확인. CLIretries0도인프라preemption재실행막지못함(Modal공식docs확인). failedphase보수적전체dispatch종료wall+10초상한2.1592449, 실제posted자원.20820스냅샷. 첫재시작분기인자오류를배정대기중잡아 ap-3L99fIdYpaEVMTNBuPVMav 취소/stop,0updates;이취소상한.1877포함. AST로실제limit_recovery인자확인후현재checked_recovery실행, trainingcode10files변경없음.
- 현재승인최대new39/남성scope65, workspace163.07, 모든실패취소와미래phase상한+.25포함38.945125검증. trainpodtimeout2360/deadline2260/저장reserve600,원래13updates유지. 저장완료후fresh8H100480초제한→CPUexport1000초→2H100새2take600초. old0회/재개코드7개변경없음.
- 완료후 collect.py(GPTvenv)로2WAV+tokens+checkpoint증거다운, audit.py(asr-runtime)로무료MLX ASR, package.py로index3arm비교. baseline은 ../new-script-compare-v1의source23/male10같은ref/대본/seed4321/1,.9,4097기존4WAV재사용. 모든실패도표시. 새breath13태그단독제어는미확인(확인된event0,5후보/28의심보호). trim.16s만.
- 비교와다운로드/reload확인뒤 cleanup_temporary_source.py 무료SDK로 이번native-source23약73.7GB만삭제/old보호목록직전직후동일검증. 새full/native는보존. 비용receipt/최종billing/appstopped확인, 비교보고서open_in_codex,UI/audio검증. 장기allweights보관약41.5달러/월별도미삭제.

---

# 2026-10-26 숨 보존 남성204개 Full FT 추가승인·실행 중

- 최신 사용자 승인: 추가$35 허용, 남성작업 전체$65. 이번 breath-aware-v2 최대$39, 이전남성승인98.07기준 workspace163.07 spendlimit UI 저장확인/스크린샷보존. 기존$30authorization는 변경하지않음. 장기보관료별도.
- source23부터새단계13updates,204unique+4explicitreplay,평가57whole-source02,ref4. 이전male10/23/5보존. 기존7개trainerfiles변경없음. 신규breath_stage_plan/train,modal_drama3_breath_stage만추가. 한국어HuBERTauxiliary/원래codec유지,35.9BfullFT.
- 신규특성: 자동감정/말투태그제외, 확인된실제숨이벤트만태그컴파일(현재0확인;5후보/28보호구간보존).204train953.79→953.63s,2개파일에서.16s만무음축소. 원본/평가보존. train-only stats204재계산, SHA일치202rawcache재사용가능/63새추출. 53unit통과+실제plan3종오염거부/분할해시검증통과.
- 현재CPU출발23export ap-jQWivTxqGzolzKWUaQ58AX, L4features ap-Qc5HfGxhbTqRNpwqXhOHOh 실행중. 새학습update는아직0. 새유료retry자동금지. 단계별상한전체37.6714포함.25margin. root output/voice-upload/male-asmr-01-20261026/breath-aware-v2.
- 다음: export/features완료→8H10013update전후57heldoutloss→완전옵티마이저/RNG/cursor저장/Volumecommit→별도fresh8H100재개검증→CPUnewnative→2H100새일상/속삭임2take. 기존new-script-compare-v1 baseline23/male10 WAV동일조건으로재사용. 실제생성누락검사/모든실패표시. 품질개선보장아님. 임시source23export마지막정리, 보호old체크포인트삭제안함.

---

# 2026-10-26 새 대본 실제 학습 전후 비교 완료 — 남성10 품질 미통과

- 최신 요청 “다른 대본으로 비교음성을 만들어봐봐”에 따라 기존 $30 승인 잔액 안에서 추론·임시 CPU변환만 최대$4 별도 예약. 추가 학습0, 운영배포0. 일상/속삭임2대본 × source23/male10 =4WAV 실제 생성, 같은 현재 남성참조/seed4321/공식Space1.0,.9,4097. 원래 실패했던 괜찮아 대본은 재시험하지 않았음.
- 결과: source23 daily EOS101frames4.69s, whisper EOS290frames13.47s; male10 daily length384frames17.83s, whisper EOS200frames9.29s. 로컬MLX ASR source23두개는 끝구절확인통과, male10daily는 오늘하루는어땠어 첫문장만, male10whisper는 2분정도로인식되어미통과. 속삭임ASR 불확실하므로 실제발화내용 확정/사람선호점수아님. 새10학습이개선됐다고주장불가. top-k해제만으로모든출력문제가해결되지않음; 대본/seed/settings함께변경했으므로원래누락원인완전확정아님. 유료추가학습 전에 업데이트/데이터/정렬·다중seed 재현성검증 우선, 자동재시도금지.
- 새 runner modal_drama3_new_script_preview.py는 export/generate만가능, training없음. 첫시도parentmodule패키징누락으로사용자함수실행전import실패, app ap-OCyhw8H3Dy2qy80kCnsVqv 명시stop/출력폴더부재확인. 별도 격리번들import검사통과 후 packaging_fix실행; 실패시도비용도같은4달러포함. CPU app ap-T5glWY8RoRPFjGtzbh2B4O, GPU app ap-wF7icnXtYbiTrfFurhd1oq 모두stopped/tasks0확인.
- source23합성용파일은이미정리돼있어 보존된전체23에서임시로재구성,885텐서43샤드. checksum manifest5fb4…ee476 이전정상export와동일검증. 새4WAV/원시frames/EOS확률진단/참조약8.9MB 로컬다운로드와모든SHA검증완료. 음량/속도후처리·이어붙이기없음.
- 다운로드검증/GPU종료후 이번작업전용 temporary-native-source23 73,691,602,467bytes만무료SDK로정리. source23full/male10full+native/기존5native 파일목록·크기직전직후동일확인. 새WAV와tokens보존. 따라서이번일로장기보관량69GiB추가유지안함. Mac공간부족해 재다운로드가능한third-party SER cache1.263GB만삭제(학습가중치아님); config/provenance/분류결과보존.
- 보고서 http://127.0.0.1:8814/new-script-compare-v1/index.html. 정확한비용/보수적상한은 COST_RECEIPT.json. 계정snapshot119.39→120.81 증가1.42달러이나다른실행정산지연가능; 자체앱자원반영액1.2446달러스냅샷. 기존$30전체예산/최대128.07한도유지, paid-stage-v1/phase-history/new_script_compare_v1.json와ledger에이번상한반영.
- 검사: 음성코드44unit tests통과, 자체3module격리번들import통과, source23재export동일성·4take다운로드검증. 실제청취/자연스러움평가를했다고말하지않음. 다음유료실행은시작하지않음.

---

# 2026-10-26 대사 누락 설정 차이 확인·전체 데이터 견적 — 유료 실행 없음

- 사용자 요청: 대사 누락 수정 우선, 평가용 보존, 나머지 사용 가능한 데이터 전부 학습 견적. 유료 GPU/Modal 함수·운영 배포0건. 기존 전체 가중치/옵티마이저/원본 음성 보존.
- 새 1차 근거: Fish 공식 Space `fishaudio/Drama-3` revision `c368729ab9347dda6635c5272ad31e6521114b79` server.py85–91에 top-k30 무음 정체(자체 H20040개 중11개 length), 제한해제0개 기록. UI top-k0를 native4097로 전달하며 기본 T1/p.9. 우리6개는 T.7/p.7/k30. 실제 Miro 남성에서 인과확정/정상화 재생성은 아직 아님. 공식 소스 로컬 보존 diagnosis-local/official-space/server.py, SHA와 URL remaining-data-plan/INFERENCE_FINDING.json.
- sampling_profiles.py에 legacy/.7.7.30, top-k-only/.7.7.4097, official-space/1.9.4097 명시 프로파일. modal listen에서 선택 설정과 EOS추적 동일 적용·결과 기록. 원래 manifest는 legacy로 재현, 새 프로파일 명시 opt-in. pinned generator는 k0 의미 다르므로 직접0전달 금지. 자동 유료 재시도 없음. 현재 남성10만 로드하는8take 2seed 통제검증 계획 준비, 아직 전용 runner/유료승인 없음. 기존run STARTED/phase중복가드 유지.
- 무료 데이터 감사: 자동 통과265개20분42.28초, 기존160개12분30.91초, 남은 학습 가능44개3분22.88초. 전체 학습 후보204개15분53.79초. 평가 녹음 source02 전체57개4분31.49초 유지(기존40외17개도 학습 제외), 참조4개17초 유지. 265개 WAV SHA/길이/형식 재검증, train/heldout 파일·정규화본문 겹침0. 원본55분 전체 불량이라 하지 말 것:55개 review,20개 음악/효과음 의심, 전사 제외 구간은 재검수 가능. 후보204는 자동 초안이지 human gold 아님. 예전160 cap은10업데이트용 예산 선택이었다.
- 견적(현35.9B Full FT/8H100/16globalbatch/optimizer 보존): 남은44개만3업데이트 학습·로딩·저장·평가손실 $11.83–17.54, 누락AB/새재개검증/CPU변환/일부비교음성까지 $18.24–28.75. 전체204개 한 번 더13업데이트는 $19.99–25.70 / 총 $26.41–36.91. 마지막12개 버리지 않고4replay 명시. 예상범위이며 하드상한 아님; 실측74.35초/update, 이전 fullrestore290초·savecommit410초를 근거로 불확실 상단 추가. 실패한 account-paused run/source23 재변환 비용 반복 포함 안함.
- 현160/10 고정 trainer는 확장 dataset plan hash를 거부하므로 그대로 resume 가능하다고 말하면 안됨. 확장시 parent160 데이터/스케줄 prefix, optimizer/head/RNG, 기존 train-only normalization을 명시 보존하는 migration 검증 필요. 이 턴은 구현 전 요구조건/견적만; frozen trainer7파일 SHA4ec3…6723 그대로 확인. 저장된 남성10 fresh-engine reload는 아직 미검증.
- 새 full+native 추가469.87GiB, 전부보존시 총1484.94GiB/상시한달저장료 $41.48. 현재1015.08GiB/무료1TiB내. 성공 재개확인 후 옛male10 교체 보관은 별도 명시삭제결정 필요; 이번 모델삭제 없음. 이전$30남은 snapshot$8.68은 새 승인 아님.
- 검사: GPT-SoVITS/venv python으로 전체 voice unittest44/44 통과(집중14 포함). 이전 진단의 다른 runtime4오류 기록은 과거 상태로 보존. 새 합성/품질검증 아님. HTML390/1200px overflow없음/pageerror0/내부9링크200. remaining-data-plan/voice-regression.log, BROWSER_QA.json.
- 보고서 http://127.0.0.1:8814/remaining-data-plan/index.html, DATA_COVERAGE/COST_ESTIMATE/PENDING_INFERENCE_AB/CONTINUATION_REQUIREMENTS.json. 새 유료학습 시작 금지 유지. 다음은 추가학습보다 $1–2 추론원인검증이 우선이나 현재는 미실행.

---

# 2026-10-26 대사누락 무료원인조사 · 부분해결 DONE_WITH_CONCERNS

- 최신요청: 둘다 괜찮아만나오는 원인 추적·수정, 추가유료실행금지. GPU/Modal함수 실행0, smallmetadata/tokenizer/refcodes 무료API조회+로컬분석만. 모델가중치/옵티마이저/고정학습코드 불변.
- 확정: 실제고정tokenizer로세문장전부prompt에남아있음(200/206/210rows). 현재23native43샤드SHA목록해시5fb4a8ad…ee476은 이전정상생성native와완전동일, config도동일. 현재6개같은seed20261026, 모두320frames길이종료, ASR괜찮아, 첫1초대비2초이후RMS16~25dB감소. 주참조 전사 재검사일치, codes10x134/고유값풍부. source23에서도실패하므로새10학습만의원인단정불가.
- 과거미학습원본Drama3의 동일relief대사/007참조/말투에서seed1234는괜찮아만+length,4321은괜찮아나여기있어+EOS인것을실제기존WAV로무료ASR재확인. 같은23의기존27초긴대사도ASR완주확인. 따라서샘플링조건의출력붕괴가원본에서도존재하나현재남성실패의세부trigger(참조/seed/도메인일반화)는미확정. 종료확률/토큰이이전6take에저장되지않아WAV로역복원불가. 새음성정상화나완전원인해결이라말하지말것.
- 코드수정3파일: drama3_fullft/utterance_diagnostics.py, test_utterance_diagnostics.py, modal_drama3_single_male.py. 길이상한종료는complete_with_quality_failure로분리, EOS만으로성공불가/독립전사본문·끝구절검사, 불확실ASR은review. 미래승인eager추론에서원시frames와매draw EOS확률/순위/primary support기록(추가forward/RNG없음). 자동유료재시도없음. 현runphase중복가드는계속유지되므로무심코재실행불가.
- 로컬collector/audit/packager에실패상태·선택적토큰진단다운로드·완주검사통합. 이전6WAV/raw생성report는보존하고기존전사에새검사만파생추가. current6모두거부. old원본seed비교의완주된1개는통과하는회귀검사포함11개통과. 기존전체41검사에서는4개의기존fish_speech의존성/codec_contractfixture오류지속(새검사제외기존30에도같은4개). 전부green이라고말하지않음. 작은무작위가중치native CPUcache parity chunk64/128/512 오차~1.3e-6, 실제35.9B음질검증아님.
- 보고서 http://127.0.0.1:8814/diagnosis-local/index.html, JSON REPORT.json/PROMPT_TRACE.json/HISTORICAL_RECHECK.json/BEFORE_AFTER_REGRESSION.json. 과거007원본2WAV만근거표시용로컬복사했으며새남성음성이아님. compare.html에서진단링크연결. 실제35.9B재생성검증·운영배포없음. 다음최소실험은추가학습아닌같은현재참조/대사에seed대조(1234/4321/20261026)와EOS기록이며아직유료승인요청/실행하지않음.
- 재조회청구119.39로이전120.34보다0.95하향정산됨. 새승인기준98.07 대비21.32, $30내. 이번조사유료함수실행0, 추가사용료발생이라고해석하지말것. FINAL_COST.json에이전22.27상태별도보존. 저장공간1015.0757GiB/옛5재개451GiB삭제완료상태유지.

---

# 2026-10-26 승인한 옛5회 재개 파일·실패잔여 정리 완료

- 사용자 비동기 답변 “옛 재개 파일·잔여분만 정리”에 따라 STORAGE_CLEANUP_PROPOSAL의 정확한 두 경로만 영구삭제했다. stage20-v3/step-000005 430,824,917,978bytes와 budget44-resumable-v2/step-000005 53,856,453,797bytes, 합451.394703GiB. 삭제 후 두 경로 부재 확인.
- 삭제 직전/직후 기존23과새10 full재개상태 각32필수파일·COMPLETE/COMMITTED·크기 재검증. 기존5 native 및새10 native 각43샤드/885텐서와모든파일크기 보존확인, step1 codec/config/tokenizer 보존. PROTECTED_BEFORE/AFTER 동일. GPU재학습·생성·재로드 검사는하지않음.
- 삭제 전옛메타데이터·파일목록 로컬보존. 감사영수증 output/voice-upload/male-asmr-01-20261026/paid-stage-v1/approved-old-resume-cleanup/RECEIPT.json. 예전5회 옵티마이저 상태로의재개는불가, 기존5음성생성가중치는존재.
- 모든관련볼륨 API재조회 총1015.075698GiB, 1TiB무료구간이내/여유8.924302GiB. 현용량유지시초과보관료예상0달러/월. 과거발생요금은별개. 유료compute호출0. FINAL_STORAGE.json와compare.html 안내갱신. 이전삭제승인대기상태는해결됨.

---

# 2026-10-26 남성 Full FT10업데이트·저장·비교 완료 — 품질 미통과

- 실제35.9B FullFT10업데이트(160개 표본1회 사용) 완료. 새 full checkpoint32개/430,824,909,008bytes 및 optimizer·RNG·cursor 클라우드 커밋, 독립 API 크기 검증 완료. fresh GPU optimizer engine reload 검사는 미실행. 코드/형상 문제가 없다는 전체 품질 보증이 아님.
- native43샤드/885텐서 재구성 및 실제GPU로드, 같은남성참조/같은대사/같은seed로 source23 vs male10 각3말투=6WAV 생성·다운로드·SHA검증 완료. 모든유료앱 stopped/tasks0. 운영배포 없음.
- 결과는 실패로 공개:6개 모두 EOS 없이320프레임/14.86077초 길이상한, 무료 MLX ASR는6개 모두 괜찮아만 인식(CER83.33%). 따라서 개선/클로닝성공/사람같은연기를 주장하지 않는다. ASR는사람평가가아니며 agent직접청취 수행하지않음. source23에도같은문제가있어 새10학습만 원인이라 단정 불가. 원본미변경Drama3/23같은현재남성참조 대조로 공통추론경로와기존23손상 분리가 다음우선이며 추가유료실행은 시작하지 않음.
- 비교 http://127.0.0.1:8814/compare.html. 브라우저390px 검사7오디오metadata로딩/overflow없음/오류없음. 결과 paid-stage-v1/listening/local_audit.json, QUALITY_STATUS.json. 오디오원본·생성물 모두 보존.
- 승인새실행비30달러, 기준98.07→현재120.34 차액22.27(청구반영지연가능), 자원보고현재21.22009, dispatch시간 보수상한23.36813. FINAL_COST.json. 모든실패·CPU준비·복구·GPU미리듣기도30달러에포함. 플랫폼상한128.07유지. 더유료실행하지않음.
- 이실행의 임시 native-source23 복제본73,691,602,387bytes만 삭제·확인. 삭제직전 원래23과새10 full상태32개씩 재조회·크기검증. 원본23와새10,기존5native보존. OWN_SCRATCH_CLEANUP.json.
- 기존모두보존시워크스페이스현재1466.4704GiB, 전체한달유지초과보관료월약39.82달러(실제GiB시간/무료할당사용에따라다름). 오래된5회exactresume+불완전잔여451.39GiB삭제질문은아직답없음, 삭제안함. 승인되면기존5native/원본23/새10보존하며1015.0757GiB예상. FINAL_STORAGE.json, STORAGE_CLEANUP_PROPOSAL.json. 승인없이이두옛checkpoint삭제금지.

---

# 2026-10-26 남성 한 명 Full FT10업데이트 완료 · 비교 음성 생성 중

- 승인한 새 실행비30달러 내에서 실제35.9B 전체 파라미터10업데이트를 완료했다. 기존23회 TTS 가중치에서 시작했고 새 남성160개 고유 목표를 한 번씩 사용했다. 10epoch가 아니다. 비중립 감정 오라벨은 제외, 속도·강약·속삭임 적응 시험이다.
- 새 checkpoint32필수파일430,824,909,008bytes, COMPLETE/VOLUME_COMMITTED, optimizer·RNG·다음 데이터 위치가 저장됐다. 독립 새 API 조회32개 크기 일치. fresh GPU optimizer engine reload 검사는 예산 절약으로 미실시, 검증 완료라 주장하지 않는다. train_result.json / NEW_CHECKPOINT_CLOUD_VERIFICATION.json 참고.
- 새 native BF16 모델43샤드/885텐서 export 완료, 클라우드 커밋/모든 파일 존재 재조회. native-export-metadata/FRESH_API_VERIFICATION.json. CPU export app ap-HXtMlaxsBBYZwvKlYgoAg6 종료. 학습 GPU app ap-2MnISBuvxWtexvLZQoWoOs 종료.
- 비교 음성 생성 app ap-hkvvurvi8QcyYbsCf13v0h, 로컬 세션31912, listen.log. 기존23 vs 새male10, 같은 참조/같은 대사/같은seed, 기본·slow_soft·whisper 각1개=6개. 추가 학습 없음. 클라우드 최종파일 다운로드 후 무료 로컬 ASR 검사, compare.html 배포(로컬만) 예정.
- 현재 청구총118.88, 새 승인기준98.07 대비20.81달러(지연 가능). 모든 실패·준비·복구·미리듣기도 같은30달러 안에 포함, 플랫폼 상한128.07.
- 오래된5회 재개 파일+불완전 잔여451.39GiB 삭제는 사용자 답변 대기. 삭제 금지 상태. 원래23·새10 재개 체크포인트와 기존5 native는 보존. 승인 없으면 옛 파일 유지에 따른 예상 보관료월39.82달러 안내. 이 실행의 임시native-source23만 결과완료 후 정리 가능, 원래23 원본은 삭제 금지.

---

# 2026-10-26 승인30달러 작업 재개 — 실제 Modal spend limit 수정

- 실제서비스 중지 한도가100달러여서 첫8H100로드 도중 disabled. 업데이트0, optimizer/학습history/checkpoint 없음(무료클라우드목록확인). 소스23과이미완료한native43샤드/특징204는 온전. 첫 GPU앱 ap-tjXRQdzGuOOshAyhKOWhrB 종료.
- 사용자승인은 새실행비30달러, 기준청구98.07→최대128.07. CUA Brave에서 Modal Usage &billing의 Edit spend limit를128.07로저장, toast와screenshot검증. 추가승인요청없이 기존승인범위반영. screenshot paid-stage-v1/modal-spend-limit-12807.png. 청구값은중단시103.94였으나나중101.75로조정되어잠정값임.
- CPU변환900초상한에 걸렸지만32개완료조각재사용, finish_source23에서남은11개만쓰고43개전체SHA검증완료. 완료 result파일있음. 처음부터전체재변환하지않음.
- 현재 train_after_limit_fix 신규앱 ap-2MnISBuvxWtexvLZQoWoOs에서GPU로드중. 새timeout1800/저장예비600초. 같은30달러에모든시도비용포함, 첫실패GPU실측상한3.14236달러. 재개코드는필요24클립씩만사전검증해204개×8중복I/O제거. 실제학습구조35.9B FullFT/160고유목표/10업데이트그대로.
- 로컬세션53997이현재CLI실행이다. 로그 output/voice-upload/male-asmr-01-20261026/paid-stage-v1/train_after_limit_fix.log. paid_ledger와phase-history각파일로비용예약. read_ledger는실패한단계의 execution_elapsed_upper_usd도반영(기존예약전체중복합산버그수정, 무료guard에서만차단됐고GPU추가지출없었음).
- 후속 CPU export_new, listen 단계는모두같은승인30달러내에서만. trained export는정확히직렬화한바이트SHA/모든텐서finiteness/쓰기크기/헤더·인덱스885검증, 추가70GB재읽기는하지않고그사실명시. source23는전체내용SHA독립검증을이미수행.
- 참고 RUNNING_STATUS.json, SPEND_LIMIT_VERIFIED.json, authorization.json, stage-after-platform-stop.json. 운영배포없음. 원래23·5가중치삭제금지. 유료단계를맹목자동반복하지말고저장된상태/원인/예산확인후만처리.

---

# 2026-10-26 새 남성 FullFT $30 실행 승인 및 준비

- 사용자가 새 실행비 최대30달러를 승인했다. 새 기준 청구98.07, 실행 후 청구상한128.07. 장기보관 별도 고지. 운영배포 금지 유지.
- 실행루트 output/voice-upload/male-asmr-01-20261026/paid-stage-v1, 클라우드 /voices/_drama3/miro-male-asmr-01-20261026-v1. 새남성10업데이트/160개고유목표/전체35.9B BF16 FullFT. 비중립 감정 오라벨 조건은 제외.
- features 완료204클립, 한국어 티처 통계160학습클립SHA에 결박, 원본코덱bfloat16/torch2.8.0+cu128 계약 일치. 결과 features_result.json.
- 첫 CPU source23 변환 작업은900초 상한으로 종료. 기존23 전체 checkpoint는 보존. 이미쓴 native 부분조각은 클라우드에 남아 있다. 같은 변환을 통째로 반복하지 않고 새 finish_source23 단계에서 기존조각을 유지하고 나머지만 작성·전체검증한다. 부분파일검사 로컬 테스트 통과. 아직 H1008 학습은 미시작.
- Modal source23 app ap-7CulReu7CUcfg485yDjgFl 종료 확인. features app ap-mKTCrw0c72WosJvnxYXCip 완료. 실험파일·가중치는 git/운영배포에 포함하지 않는다.
- 비용은 paid_ledger.json과phase-history/*.json에 단계별 예약. 완료 단계는 로컬 dispatch→결과 walltime×최대자원요금+10초로 보수적 상한 재계산. 새 한도30달러 초과 시 GPU 미시작. 동일 유료단계 자동재시도 금지; 별도 finish 단계는 남은 저장 파일 이어쓰기만.

---

# 2026-10-26 감정·말투 자동 라벨 및 남성 새 단계

- 사용자 요청: 감정 라벨부터 붙인 뒤 같은 남성 한 명 목소리 클로닝 FullFT 유료 학습. 새 숫자 지출 한도는 아직 승인되지 않았다.
- 로컬 Korean SER340개 분석. 슬픔 원시 예측285/340으로 분포 집중 관측. 오라벨 학습 방지를 위해 비중립 감정 조건 보류. 최종 자동 약라벨은 중립 후보11/미확정329, 사람 검증0. 확정 감정 라벨 완료라고 말하지 않는다.
- 학습160개에 속도(느림32/보통96/빠름32), 강약(약함32/보통96/강함32), 높은 임계값 속삭임 후보3. 내부 쉼 후보20은 ASR시각 기반 메타데이터이며 숫자 쉼 조건 학습은 미구현. 원본을 변형하지 않았다.
- 같은 대사·녹음 분할 및204파일 해시 재검증,160개 고유 목표/참조 스케줄 검증. 조건 초안과23→남성 새10업데이트 계획 고정. 새 학습기 코드 준비 및 CPU 부정 사례 검사 통과; 실제GPU/부모저장 오케스트레이션 미검증, 코덱·한국어 티처 캐시 미생성.
- 기존23회 클라우드 필수32파일430,824,909,904바이트/완료·커밋 표식 재확인. 기존 가중치는 수정하지 않았다.
- Modal기존한도$100 중98.07사용,1.93남음. 새 실행 예상22–30달러, 새 상한30달러 질문을 비동기로 보냈고 답변 대기. 현재 유료 실행0. 모든 기존 파일+새 full/native 유지 시995.28GiB→약1465GiB로 장기보관 초과분 약월40달러(다른 볼륨 제외) 가능. 유료 시작 전 보관안 확인 필요, 아무 파일도 삭제하지 않았다.
- 검토 http://127.0.0.1:8814/review.html. 결과 output/voice-upload/male-asmr-01-20261026/EMOTION_LABEL_REPORT.json / PAID_STAGE_ESTIMATE.json.

---

# 2026-10-26 남성 한 명 ASMR 자료 준비

- 최신 사용자 확인: 이번에는 남성 한 명만. 기존 aihub001/011 후보 대신 사용자 제공 MP4 두 개와 MP3 한 개를 `miro_male_asmr_01`로 준비한다.
- 원본55분37초 보존. 로컬 Whisper 초안 전사와 PANNs 소리 판별 완료. 자동 기준 통과265개·20분42초, 학습160/평가40/참조4개 초안 구성.
- 같은 녹음/대사 분할 누출 검사 및204개 파일 해시 검증 통과. 단일 화자10업데이트160개 표본 스케줄 작성.
- 감정 라벨·전사 정답은 확정하지 않았다. 실제 코덱/한국어 티처 특징 캐시와 새 단계 학습기 연결·재개 검증은 남았다. 유료 학습·새 가중치 생성·새 배포는 실행하지 않았다.
- 결과: output/voice-upload/male-asmr-01-20261026/DATASET_READINESS.json. 검토 http://127.0.0.1:8814/review.html.

---

# PM Status — Miro 음성·PWA 다음 작업 계획

**Last briefing**: 2026-10-24 KST
**Current focus**: 로컬 음성 연출·PWA 변경을 실제 앱 흐름에서 검증하고, 남성 2명 공유 모델의 학습·서빙 준비를 마친다.
**Active sprint goal**: 남성 2명의 음색과 맥락별 연기를 검증한 하나의 Miro 모델을, 설치형 PWA의 실제 채팅에서 비용 제한과 함께 사용할 수 있는 상태.

## 확인한 상태
- 현재 main HEAD3b6fa88. 10/25에 음성·PWA·회색 그룹 사이드 메뉴를 운영 배포하고 origin/main으로 푸시했다. 기존 미추적 학습·실험 자료는 보존하며 공개 저장소/배포에 포함하지 않았다.
- 대사별 감정·말투·속도·강약·쉼 생성 계약, 서버 소유 대사 요청, 순차 재생, 끄기 취소, 수동 재시도와 비공개 native TTS 어댑터를 로컬 구현했다. 실제 모델 품질을 검증한 것은 아니다.
- PWA 설치 안내·키보드 viewport·오프라인 공용 화면·오른쪽 대화 메뉴를 로컬 검증했다. 실제 iPhone 설치·키보드·자동 재생 검증은 남았다.
- 운영 사이트의 기존 manifest/worker/아이콘 2개는 200 응답으로 확인했다. 10/25에 이번 변경을 운영 반영했고 공개 배포 파일 해시와 상태를 확인했다.
- 10/24 후속: 서버 영속 음성 큐·사용자별24시간 결과 캐시·중복 방지·사용자/전체 예약 한도·동시 실행1개·중간 종료 격리를 로컬 구현했다. 독립 테스트 DB 전체 마이그레이션 및29개 관련 테스트, 루트/웹 타입 검사가 통과했다. 기본 비활성 상태이며 운영 DB/유료 생성은 실행하지 않았다.
- 남성001/011 원본을 화자 필드 기준으로 다시 검색했지만 로컬에서 찾지 못했다. 공식 API 조회는502였으며 데이터 다운로드/훈련을 시작하지 않았다. 남성 목소리 청음 검증도 미완료다.
- source23의 TTS 가중치는 재사용 가능하다는 기존 감사 기록이 있다. 007 단일 화자 작업의 산출물이며, 다화자 한국어 일반화는 검증되지 않았다. 코덱은 고정되어 있다.
- 남성 후보 aihub001/aihub011은 라벨 MALE 확인. 원본 녹음·음질·성인 용도 허용 범위 최종 확인과 실제 학습은 미완료다.
- 남성 A 10 업데이트 → 저장/재개 확인 및 청음 → 같은 모델에서 남성 B 10 업데이트 → A/B 모두 평가하는 계획이 준비되어 있다. 10 업데이트는 데이터 전체 10순회가 아니다.
- 마지막 기록의 잔여 예산은 약 $1.33(잠정)이지만 이번 점검에서 현재 청구·잔액을 조회하지 않았다. 이 숫자를 새 지출 승인이나 현재 잔액으로 사용하지 않는다.

## 10/25 운영 반영
- 커밋3b6fa88, https://miroapp.app 정상. 음성 큐 마이그레이션2개 테이블 RLS 및 Data API 권한 차단 확인. 큐/유료 합성 워커는 비활성으로 배포했다.
- Node24 루트/웹 타입 검사와3개 언어 번역 누락0개. 배포 절차에서 별도 테스트는 실행하지 않았고 운영의 로그인 채팅 화면은 직접 확인하지 않았다.
- 23회 체크포인트32개 필수 파일 크기와 원격 완료/commit 마커를 재확인했다. 남성001/011의 원본은 미확보, 인증키를 사용해도 공식 API502다.
- 현재 Modal 청구98.07달러, 기존 전체 한도100달러의 여유1.93달러(변동 가능). 새 유료 학습은 시작하지 않았다. 남성 녹음 경로와 새 지출 상한이 필요하다. 상세 output/release-20261025/RELEASE_RESULT.json.

## 문서와 실제 차이
- 10/12 PM 문서·README의 오래된 운영/가격 상태는 이번 음성 작업의 현황을 대체하지 않는다.
- SERVING_INTEGRATION_PLAN.json의 30초·브라우저 음성 fallback·연출 미구현 설명은 과거 상태다. 현재 코드는 대사별 연출, 170초 대기, 실패 시 명시적 수동 재시도로 변경되었다.
- 서버 큐/개인별 캐시/예약 비용 제한은 후속 구현했다. 실제 Modal 청구·유휴 GPU 비용을 직접 제한하는 기능은 아니며 실측 비용과 클라우드 지출 제한 확인이 남았다. 로컬8810은 가짜 응답 미리보기이며 실제 모델 품질을 검증하지 않는다.

## 다음 액션 — 의존 순서
1. 완료(로컬): 실제 Next 앱의 신규 가입·페르소나·대화 생성/저장→영속 큐→별도 워커→캐시→브라우저 실제 재생 종료·채팅 모드 복귀까지 검증했다. 모든 모델 응답은 로컬 mock/무음이며 유료 합성을 호출하지 않았다. 보고서는 output/speech-queue-20261024/IMPLEMENTATION_RESULT.json이다.
2. 완료(로컬): 영속 음성 작업 상태·중복 생성 방지·개인별 결과 캐시·사용자/전체 요청 제한을 구현했다. 장시간 GPU 대기는 별도 합성 워커가 처리하고 모호한 실패는 격리해 자동 유료 재시도하지 않는다.
3. 무료: 남성 2명 원본을 확보해 화자·대본·감정·호흡·노이즈·이용 범위를 확인한다. 참조/학습/평가를 분리하고 남성 단계의 스케줄과 안전 재개 러너를 실제 연결한다.
4. 무료: checkpoint23 및 신규 단계 저장 공간·보존 정책·재개 설정을 확인한다. 사전 CPU 검증을 끝낸 후 최신 요금과 실제 잔액을 기준으로 구간별 최대 비용을 확정한다.
5. 유료 조건 충족 후: A만 10 업데이트하고 필수 체크포인트의 원격 저장·재로딩 검증 및 동일 대사 청음 비교를 마친다. 무조건 더 돌리거나 B를 자동 시작하지 않는다.
6. A 평가 통과 후: A 결과를 이어 B 10 업데이트. 동일 공유 모델에서 A/B 음색 유지·발음·감정·속삭임·긴 대사·반복 생성 안정성을 비교한다.
7. 모델 통과 후: 비공개 GPU 서빙에 모델 1개와 참조 ID 2개를 연결한다. 실제 대기 시간·재생 실패·재접속·중복 과금과 발화당 원가를 정해진 한도에서 측정한다.
8. 최종: 실제 iPhone/Android의 홈 화면 설치·로그인 유지·키보드·대화 재개·음성 첫 재생을 확인한 뒤 운영 반영 대상을 정리한다. 배포는 별도 요청 전까지 진행하지 않는다.
9. 음성 경로 통과 뒤: 언베일 이미지 기능은 기존 클라우드 경로를 먼저 점검하고, 맥락별 이미지 요청 연결과 비용 제한을 계획한다. 이번 단계에서 새 이미지 학습을 시작하지 않는다.

## 다음 마일스톤의 통과 기준
- UI: 홈 화면으로 실행한 실제 기기에서 입력창이 가려지지 않고, 메뉴·다중 줄 입력·읽던 위치·음성 시작/취소가 동작한다.
- 품질: 사전에 고정한 동일 대사/참조/설정으로 기존 Drama3·source23·신규 체크포인트를 비교하고 사용자 청음을 포함해 채택을 결정한다. 속도·강약 태그 전달을 실제 연기 성공으로 간주하지 않는다.
- 비용/복구: 확인된 원격 재개 지점과 추가 비용 상한이 있으며, 동일 발화의 중복 생성·무단 자동 재시도가 없어야 한다.
- 범위: 첫 남성 2명의 공유 모델이 목표다. 모든 새 화자에 일반화되는 한국어 기반 모델의 완성이나 프로덕션 품질을 10+10 업데이트만으로 보장하지 않는다.

## 승인과 제약
- 사용자의 ‘ㄱㄱ’로 계획의 무료 구현·검증을 진행했다. 유료 GPU/합성·이미지 생성·운영 배포·결제·외부 메시지는 실행하지 않는다.
- 기존 체크포인트/복구 대상은 보존한다. 사용하지 않는다고 임의 판단해 삭제하지 않는다.

---
아래는 10/12 이전의 이력이며, 현재 음성·PWA 범위는 위 기록과 최신 검증 자료를 우선한다.

# 2026-10-12 베타·마케팅 PM 점검 — aa309f2

**Last briefing**: 2026-10-12 14:29 KST
**Current focus**: 소규모 유입과 함께 신규 유저·토큰 과금·실제 기기 푸시·재방문 측정 검증
**차기 마일스톤**: 신규 유저가 가입·첫 답변·실제 알림·다음날 대화 재개 흐름을 완료하는 제한 베타

## 확인한 상태
- aa309f2 운영 배포와 origin/main 동기화 완료. health 200/ok=true/db=up/schema=ready/cron=fresh, AI ready.
- 운영 관계·기억·사건·문자·캐릭터 생활 기능 활성. 이미지·통화·Live는 비활성. 성인 인증 제공자 mock.
- 새 토큰 정책: 유저 주도 대화 모두 토큰 차감, 가입 선물 300토큰·7일.
- 최신 CI 실패 31개, 이전 67개, 새 실패 0개. 전체 검사 통과로 보지 않는다.
- signup/character_selected/rp_started/rp_message_sent/recharge_purchased 이벤트 기반 존재. 일반 서비스 UTM·온보딩 완료·재방문 통합 보고서는 추가 확인 필요.

## 우선순위
1. 새 토큰 정책과 기존 실패를 대조하고 지급·차감·실패 반환·중복 요청을 검증한다.
2. 일반 계정으로 모바일 신규 유저 흐름과 실제 지원 기기의 앱 밖 알림 수신을 확인한다.
3. 대표 캐릭터의 첫 10턴 체감과 무료 잔액 소진 시점을 피드백받는다.
4. 캠페인별 가입·첫 대화·다음날 대화 재개를 측정하며 소규모 틱톡 유입을 진행한다.
5. 일반 유저 언베일 공개 범위면 실 본인인증을 연결하고, 무료·선톡·실패 요청을 포함한 운영 원가를 확인한다.

## 결정·한계
- 새 개발·실결제·실기기 발송·추가 배포를 승인받은 것은 아니다. 이번 요청은 다음 할 일에 대한 판단이다.
- 9월 무료 MIRO·Pro 월간 풀·예산 0 기록은 당시 이력이며 현재 정책을 대체하지 않는다.
- 이번 점검은 읽기 전용 운영 확인과 PM 기록 갱신만 했다.

---
아래는 이전 PM 기록이다. 현재 운영 상태는 위 점검과 최신 토큰·관계 문서를 우선한다.

## 2026-10-10 캐릭터별 상세 글 강조색 운영 배포 완료

- 운영 코드 `d629265`, 정식 주소 https://miroapp.app, 배포 https://miro-iw1pdrx32-noah1206s-projects.vercel.app (READY).
- Node 24 공통·웹 타입 검사, diff 검사, Vercel 운영 빌드 통과. health: ok=true, db=up, schema=ready, cron=fresh. DB 마이그레이션 없음.
- 운영 정식 주소에서 백도현 보라/로즈/민트, 차도겸 앰버/라일락/청록의 실제 3색과 모바일 가로 넘침 없음 확인. 운영 화면 캡처 저장.
- 이번 배포에서는 단위·E2E 테스트를 다시 실행하지 않음(miro-ship 절차). 구현 단계의 관련 테스트 6개 통과 기록 유지.

## 2026-10-10 캐릭터별 상세 글 강조색 (구현 기록)

- 공식 14명은 각각 다른 이름·당신·핵심어 3색 팔레트. 차도겸 앰버/라일락/청록, 백도현 보라/로즈/민트, 서이안 새벽 블루/로즈/베이지 등 공개 세계관에 맞춘 조합.
- 공개 소개·세계관·첫 장면의 이름과 이야기 핵심어를 표시 단계에서만 강조. 문단/텍스트/저장 프롬프트 보존. 일반 캐릭터는 장르와 이름 기준 팔레트, 직업만 핵심어로 사용. 제작 미리보기에도 적용.
- 웹 타입 검사·운영용 로컬 빌드·관련 테스트 6개 통과. 14개 팔레트의 3가지 상세 배경 위 글자 대비 4.5:1 이상 확인. 차도겸·백도현 390px, 서이안 320px 실제 상세에서 3색과 가로 넘침 없음 확인.
- 상세 글 색상 변경은 위 배포로 운영 반영 완료.

## 2026-10-10 파비콘 운영 배포 완료

- 운영 코드 `202fc8a`, 정식 주소 https://miroapp.app, 배포 https://miro-2zdo49gee-noah1206s-projects.vercel.app (READY).
- 자수정 그라데이션 둥근 타일 + 흰 03 마크. SVG·96px PNG·16/32px PNG·16/32/48px ICO. 메타데이터 v4 캐시 갱신.
- 공통·웹 타입 검사·운영 빌드 통과, health ok/db up/schema ready/cron fresh. 운영 홈 head에서 새 4개 파비콘 주소 확인. `fc3b9cd..202fc8a` 원격 main 푸시 완료. DB 마이그레이션 없음. 이 파비콘 배포에서는 단위·E2E 테스트 미실행.

## 2026-10-10 자수정 토글·입력창 운영 배포 완료

- 운영 코드 `5f65fc2`, 정식 주소 https://miroapp.app, 배포 https://miro-lu76v2yjm-noah1206s-projects.vercel.app (READY).
- Node 24 공통·웹 타입 검사, diff 검사, Vercel 운영 빌드 통과. health: ok=true, db=up, schema=ready, cron=fresh. DB 마이그레이션 없음.
- 기존 Vercel CLI 46.0.2는 서버에서 거절됨. 공식 패키지 vercel@63.1.2를 임시 실행해 배포 성공(기존 전역 설치 유지).
- 운영 홈 로딩 직접 확인. 로그인 세션이 없어 운영 채팅방의 토글·입력 동작은 직접 확인하지 못함. 단위·E2E 테스트는 이번 배포에서 실행하지 않음(miro-ship 절차).

## 2026-10-10 자수정 클래식 토글·채팅 입력란 (구현 기록)

- 사용자 확정: 클래식 형태 + 자수정 그라데이션, 흰 광택 노브, 은은한 glow. 직접 켜기/끄기와 별도 수위 메뉴로 분리. 최초 동의 및 서버 판정 유지.
- 입력창 카드 한 줄 높이 94→80px, textarea 최소 40→32px. 여러 줄 자동 확장(최대 140px) 유지. 보내기 버튼 radius 999px.
- 웹 타입 검사·diff 검사 통과. 실제 공통/채팅 CSS 미리보기에서 390px·320px 가로 넘침 없음, 여러 줄 자동 확장 확인. 로그인한 채팅방·서버 동작 검증과 운영 배포는 미실행.
- 이전 평면 사각 토글 시안은 아래 기록을 대체함.

## 2026-10-10 언베일 스위치 라벤더 디자인 정리 (이전 시안)

- 그라데이션·빛 훑기 효과 제거. 고정 라벨과 작은 이동 노브, 켜짐은 라벤더 역할색, 선택 메뉴도 같은 색으로 통일.
- 44px 터치 높이·키보드 초점·움직임 최소화 설정 유지. 성인 모드 동의와 서버 판정 동작은 그대로.
- 웹 타입 검사·diff 검사 통과. 실제 CSS를 사용한 디자인 미리보기에서 켜짐/꺼짐 및 390px·320px 가로 넘침 없음 확인. 로그인한 채팅방 검증·운영 배포는 아직 하지 않음.

## 2026-10-10 브랜드·상세페이지 운영 배포 완료

- 운영 코드: `0340e75` — 새 03 로고, 라벤더 팔레트, Pretendard, 상세 소개 문단·소제목 색·이모지.
- 배포: https://miroapp.app / https://miro-rya50dd9o-noah1206s-projects.vercel.app
- Node 24 공통·웹 타입 검사 통과, en/ja/zh 번역 누락 0, Vercel 운영 빌드 성공. 운영 health: ok=true, db=up, schema=ready, cron=fresh. DB 마이그레이션 없음.
- 정식 주소 홈·차도겸 상세를 모바일에서 직접 확인. 새 SVG 로고 로딩, #B8A6FF, Pretendard 로딩, favicon v3, 소제목 라벤더/민트·이모지·문단과 가로 넘침 없음 확인.
- 이번 배포에서는 단위·E2E 테스트를 다시 실행하지 않음(miro-ship 절차). 직전 구현 단계의 관련 테스트 14개 통과 기록 유지.

## 2026-10-10 전체 캐릭터 상세 소개 문단·강조 정리

- 상세 소개·세계관·첫 장면에 공통 editorial 렌더링을 적용. 제작 미리보기도 같은 규칙 사용.
- 라벤더/민트 소제목, 작은 장식 이모지, 문장 경계 문단 나누기, 목록 항목 간 여백 적용. 원본 설정 및 대사는 저장 시 변경하지 않음.
- 공식 14명 공개 소개·세계관·도입부·대사의 내용 보존 검사와 인용문/소수점/강조/기존 줄바꿈 검사 통과(관련 테스트 총 14개). typecheck 통과.
- 모바일 차도겸·백도현 상세 확인. 차도겸 소제목의 라벤더/민트 색과 가로 넘침 없음 확인. 로컬 반영, 미배포.

## 2026-10-10 서체·상세페이지 가독성 정리

- 공통 서체 Pretendard Variable 통일, 상세·제작 미리보기의 제목/본문/태그 계층 일치.
- 소개·태그 secondary, 본문 primary, 이름 강조 lavender 적용. 작은 홈·메시지·배너 메타 글씨 12px로 정리.
- typecheck 및 production build 통과. 모바일 상세에서 서체 로딩, 28/18/15/13px 계층 및 가로 넘침 없음 확인. 로컬 반영, 미배포.

# 📋 PM 브리핑 — MIRO 브랜드 적용
*2026-10-10 · 로컬 작업 · 기준 4f03742*

## 1. 한 줄 요약
사용자가 확정한 03번 심볼과 라벤더 팔레트를 웹앱에 적용하고 로컬 검증을 완료했다.

## 2. 진행 상황
**완료 (3/3)**
- 네 곡면 심볼을 SVG로 정리하고 흰색·라벤더 마크, 애니메이션 조각, PWA·파비콘을 생성.
- 공통 다크 표면·브랜드·상태 토큰, 주요 버튼 상태, 선택 칩·스위치·입력 요소를 라벤더 기준으로 연결.
- 전체 타입 검사·웹앱 프로덕션 빌드·색상 대비·자산 검증 및 모바일/데스크톱 화면 확인.

## 3. 문서 vs 실제
- DESIGN.md의 주황 및 이전 M 로고 규정을 현재 심볼·라벤더로 갱신했다.
- docs/brand/palette.json과 README.md에 역할별 값·벡터 원본·자산 생성 방법을 기록했다.
- 메타 글자 #968DA5와 입력 경계 #786F8B는 가장 높은 표면에서도 대비가 유지되도록 소폭 보정했다.

## 4. 블로커 / 리스크
- 로컬 적용 완료. 운영 배포·커밋·푸시는 아직 수행하지 않았다.
- 인증된 온보딩·캐릭터 생성 전체 흐름과 실제 AI 대화는 이번 브랜드 검증에서 실행하지 않았다.

## 5. 다음 액션
1. 운영 반영 요청 시 현 diff를 검토하고 배포 절차를 따른다.

---
아래는 이전 PM 기록이다. 이번 브랜드 변경 외의 상태는 해당 작업의 최신 진행 문서를 참고한다.

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

## 2026-10-12 iPhone 푸시 실기기 수신 확인

사용자가 15:49 잠금 화면 스크린샷으로 MIRO 테스트 알림 수신을 확인했다. 한 iPhone에서 테스트 전송과 잠금 화면 표시가 확인된 것으로 기록한다. 캐릭터의 자율 연락 생성·예약·취소나 모든 기기의 수신을 검증한 것은 아니다.
