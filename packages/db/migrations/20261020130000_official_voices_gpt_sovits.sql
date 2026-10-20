-- 공식 보이스 공급자에 gpt-sovits 추가(10/20 몰입 모드). provider_voice_id 규칙(sha256)은 그대로:
-- GPT-SoVITS 는 파인튜닝 가중치 sovits.pth(없으면 참조 ref.wav)의 해시이고, 음성 서버(tooling/voice/gsv_server.py)의 목소리 폴더 이름이다.
ALTER TABLE official_voices DROP CONSTRAINT IF EXISTS official_voices_provider_check;
ALTER TABLE official_voices ADD CONSTRAINT official_voices_provider_check CHECK (provider IN ('chatterbox', 'gpt-sovits'));
