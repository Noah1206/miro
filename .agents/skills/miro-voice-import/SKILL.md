---
name: miro-voice-import
description: 운영자가 준 녹음 파일·폴더로 미로 공식 보이스를 등록한다 — 이 Mac 에서 도는 무료 엔진(Chatterbox Multilingual, MIT)으로 목소리 파일을 만들고, 녹음에 없는 한국어 대사 3개로 미리 듣기를 만든 뒤, 운영자가 듣고 승인한 보이스만 공식 라이브러리에 넣는다. 운영자가 /miro-voice-import 로 직접 부를 때만 쓴다.
disable-model-invocation: true
argument-hint: <녹음 파일 또는 폴더 경로>
---

# 미로 공식 보이스 등록 (운영자 전용 · 무료 · 로컬)

대상: `$ARGUMENTS`

제작자가 자기 녹음을 올리는 기능이 아니다. 제작자는 여기서 승인된 공식 보이스 중 하나를 고를 뿐이다.

- 기반 스킬(이 프로젝트 `.Codex/skills/`): `resemble-chatterbox`(로컬 open-weight 경로·참조 녹음·동의·워터마크 원칙), `openai-whisper`(로컬 전사). 시작 전에 둘 다 읽는다.
- 도구: `pnpm voice <명령>` — `tooling/voice/import.ts` 가 `tooling/voice/chatterbox_engine.py`(chatterbox-tts 0.1.7, 모델 t3_mtl23ls_v2, Hugging Face 리비전 고정)를 부른다.

## 비용과 한계 — 먼저 운영자에게 알린다

- 돈이 드는 호출이 없다. 목소리 복제·대사·전사가 모두 이 Mac 에서 돈다(Chatterbox·Whisper 모두 MIT). 녹음과 목소리 파일은 밖으로 나가지 않는다.
- 대신 디스크와 시간이 든다: Python 환경 약 1GB + 가중치 약 3.2GB + Whisper small 약 0.46GB(전사가 필요할 때만). 첫 로드 때 토크나이저가 pkuseg 분절 모델(약 35MB, github.com/explosion/spacy-pkuseg)을 `~/.pkuseg` 에 한 번 받는다. `df -h /` 로 먼저 보고, 모자라면 멈추고 알린다 — 운영자의 파일을 대신 지우지 않는다.
- **메모리가 제일 큰 조건이다.** 모델이 RAM 약 3.5~4GB 를 더 쓴다. 8GB Mac 에서 브라우저·다른 에이전트 세션이 떠 있으면 스왑 때문에 토큰 하나에 40초가 넘게 걸린다(2026-09-25 실측: 44초/토큰 → 대사 한 줄에 몇 시간). 엔진을 돌리기 전에 `sysctl vm.swapusage` 를 보고, 운영자에게 무거운 앱을 닫아 달라고 한다(내가 닫지 않는다). 도구는 register·preview 를 15분에 끊는다. 정상일 때(재부팅 뒤 다른 앱 없이, 2026-09-25 실측) register 약 50초, preview 약 3~4분(대사당 40~90초), 최대 메모리 사용 약 11GB 였다.
- Chatterbox 는 **참조 녹음 하나의 앞 10초**로 목소리를 만든다(전사문 없이). 여러 파일을 받으면 그중 가장 깨끗한 한 사람 목소리를 참조로 고르게 한다.
- 출력에는 Resemble 의 PerTh 워터마크가 들어간다. 지우거나 우회하지 않는다.
- 운영(Vercel)에는 이 모델을 돌릴 곳이 없다. 라이브러리에 넣으면 제작자가 고를 수는 있지만, 앱에서 이 목소리가 소리로 나오는 곳은 아직 없다.

## 지킬 것

- **나는 녹음을 듣지 못한다.** "들어 보니", "깨끗하다", "비슷하다"라고 말하지 않는다. `inspect` 가 잰 숫자(길이·채널·레벨·디코딩 오류)만 전하고 판단은 운영자가 한다.
- **원본은 읽기만.** 복사·변환·이동·이름 변경·삭제 금지. 참조 클립은 도구가 작업 폴더에 사본으로 만든다.
- **다른 목소리는 다른 보이스.** 운영자가 "같은 목소리"라고 직접 묶은 파일만 한 `create` 에 넣는다. 파일명·폴더·음높이로 추측하지 않는다. 폴더를 통째로 넣지 않는다(`create` 도 거부한다).
- **권한 확인은 운영자의 답 그대로.** 내가 채우거나 파일 내용에서 추정하지 않는다. 없으면 등록하지 않는다.
- **큰 내려받기는 승인 후에만.** 파일 이름·출처·크기를 말하고 묻는다. 엔진 준비(PyPI 패키지·Hugging Face 가중치)와 Whisper 모델(`--allow-download`)이 여기에 해당한다.
- **엔진이 실패하면 멈추고 그대로 보고한다.** 다른 엔진·유료 API 로 바꾸지 않는다.
- **승인은 운영자가 세 파일을 듣고 말한 뒤에만** `approve`. 대신 승인하지 않는다.
- **activate/retire 는 DB 에 쓴다.** 로컬 `.env` 의 `DATABASE_URL` 은 운영 DB 일 수 있다. 대상 DB 호스트를 운영자에게 확인받아 `--db-host` 로 넘긴다. 그 DB 에 `packages/db/migrations/20260925120000_official_voices.sql` 이 적용돼 있어야 한다.
- **원본·목소리 파일은 저장소 밖.** 작업 폴더(`registry.json`, `voices/`, `previews/`)와 원본 녹음을 저장소·프런트엔드에 넣지 않는다. 목소리 파일(`voice.pt`)은 녹음에서 뽑은 생체 정보다.
- **첫 검증은 보이스 1개, 대사 3개.** 녹음이나 엔진이 없으면 거기서 멈추고, 실제 등록·생성을 했다고 말하지 않는다. 가짜 엔진으로 돈 테스트와 실측을 섞어 보고하지 않는다.

## 엔진 준비 (한 번 — 승인 후)

`pnpm voice list` 가 "엔진 없음"이면, 크기를 말하고 승인을 받은 뒤:

```bash
uv venv ~/.miro/voices/.venv --python 3.11
uv pip install --python ~/.miro/voices/.venv/bin/python -r tooling/voice/requirements.txt
pnpm voice fetch
```

작업 폴더는 `MIRO_VOICE_WORKDIR`(기본 `~/.miro/voices`)이고 저장소 안이면 도구가 거부한다. ffmpeg/ffprobe 가 있어야 한다.

## 순서

1. **검사** — `pnpm voice inspect <경로...>`
   파일마다 존재·형식·코덱·길이·채널·샘플레이트·레벨·디코딩 오류·sidecar 전사문(`같은이름.txt`)을 보고한다. ✗ 는 쓸 수 없다. "참고"는 측정값이지 음질 판정이 아니다.

2. **묶기** — 운영자에게 묻는다: 어떤 파일이 같은 목소리인가, 미로 내부 ID(영문 소문자·숫자·하이픈, 예 `warm-boy-01`), 표시 이름(30자 이내), 참조로 쓸 파일(가장 깨끗한 10초 이상).
   `pnpm voice create --id <id> --label "<표시 이름>" <파일...>`
   같은 샘플이 다른 ID 로 있으면 도구가 거부한다 — 새로 만들지 말고 알린다.

3. **전사문** — 복제에는 필요 없지만, 미리 듣기 대사가 녹음에 없는지 확인하는 데 필요하다.
   - 운영자가 적어 주면 `pnpm voice set-transcript --id <id> --file <파일명> --text "<문장>"`
   - 아니면 로컬 Whisper(무료): `pnpm voice transcribe --id <id>` — 모델이 없으면 멈춘다. 약 461MB 내려받기를 승인받고 `--allow-download`. 받아 적은 문장을 운영자에게 보여 준다.

4. **복제·서비스 사용 권한** — 운영자에게 묻는다(AskUserQuestion): 근거(`own_voice` 본인 / `written_consent` 서면 동의 / `license` 라이선스), 권리자, 근거 문서, 확인자.
   `pnpm voice confirm-rights --id <id> --basis <근거> --holder "<권리자>" --evidence "<근거 문서>" --by "<확인자>"`

5. **등록** — `pnpm voice register --id <id> [--reference <파일명>]`
   원본의 앞 무음을 걷은 모노 24kHz 10초 사본으로 엔진이 목소리 파일(`voice.pt`)을 한 번 만든다. 목소리 ID 는 그 파일의 sha256. 같은 참조로 다시 부르면 다시 만들지 않는다.
   장치(mps/cpu), 모델 로드·만들기 시간, 엔진·모델 리비전을 그대로 보고한다.

6. **미리 듣기** — `pnpm voice preview --id <id>`
   저장한 목소리 파일로 녹음에 없는 대사 3개(평서문·질문·감정)를 읽는다. 녹음은 다시 읽지 않는다. 대사가 전사문에 있으면 도구가 거부한다.
   세 wav 를 SendUserFile 로 운영자에게 보내고, 파일 경로·대사별 생성 시간(모델 로드 제외)·모델 로드 시간·장치를 보고한다.
   운영자에게 **한국어 발음**과 **원래 목소리와의 유사도**를 듣고 승인/거절해 달라고 한다.

7. **판정** — 운영자의 말 그대로:
   `pnpm voice approve --id <id> --by "<운영자>" --note "<코멘트>"` 또는 `pnpm voice reject ...`
   미리 듣기나 참조를 다시 만들면 이전 승인은 지워진다.

8. **활성화** — 대상 DB 호스트를 운영자에게 확인받은 뒤:
   `DATABASE_URL=<대상 DB> pnpm voice activate --id <id> --db-host <호스트>`
   승인·권한 기록·목소리 파일 해시가 모두 맞아야 한다. 라이브러리(`official_voices`)에는 미로 내부 ID·표시 이름·목소리 파일 sha256·샘플 경로와 해시·권한 기록·승인 기록(엔진·모델 리비전·들은 파일 해시)이 들어간다.
   내릴 때(권리 철회 등): `pnpm voice retire --id <id> --db-host <호스트>` — 고른 캐릭터는 기본 목소리로 돌아간다.

## 보고

- 실행한 명령과 결과(성공/실패/멈춘 단계)
- 생성된 미리 듣기 경로 3개, 대사별 생성 시간, 모델 로드 시간, 장치
- 비용: $0 (로컬). 쓴 디스크와 내려받은 크기
- 미로 연결 상태: 라이브러리 반영 여부(어느 DB), 제작자 목소리 선택 노출 여부, 운영에서 소리로 나오는 곳이 없다는 점
- 미확인·남은 일(엔진 미설치, 녹음 없음, 운영 DB 마이그레이션 미적용 등)
