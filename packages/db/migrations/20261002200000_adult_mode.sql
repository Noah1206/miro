-- 대화방별 성인 모드(2026-10-02). adult_mode = 지금 켜져 있는가(대사 지시), adult_since = 처음 켠 시각.
-- 한 번 켠 방은 꺼도 성인 전용 모델로만 간다 — 이전 대화가 미로 메인 키(Gemini·예비 GPT)로 가지 않게.
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS adult_mode boolean NOT NULL DEFAULT false;
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS adult_since timestamptz;
