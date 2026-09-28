# Official voice work merged into main

## Scope

- User requested merging the current unfinished voice work, including the operator import skill, local Chatterbox/Whisper tooling, official library schema and creator selection UI.
- Original voice snapshot: `f0de6d4`; current main used for integration: `b1a1f29`.
- Kept the current chat/reality creation split, stable creation IDs, duplicate-save handling, private drafts and type-specific draft recovery.
- Added voice selection to draft recovery and updated the voice integration test for both character types and the current save-action return value.
- Python bytecode caches are ignored. No credentials, recordings, model weights or generated voice artifacts are committed.

## Verification

- Node 24.18.0, frozen pnpm lockfile install: passed.
- Typecheck: passed.
- Vitest: **809 passed, 1 existing skipped**, 104 test files.
- First full run lacked the four required official-character seed fixtures in the newly created test DB; seeded that local DB and reran the suite successfully.
- Web and admin production builds: passed.
- Playwright create/edit: **5 passed**, one worker, zero retries. Covers publish, private draft recovery, separate type drafts, editing and ownership protection.
- Voice workflow tests use synthetic tones and fake synthesis/transcription executables. They verify control flow, hashes, approval gates and persistence, not Korean speech quality.
- Test DB: `postgres://localhost/miro_voice_merge_20260928_test`; no production fixtures or production cleanup.
- CI installs ffmpeg so voice inspection tests are exercised there.

## Production database compatibility

- Applied only `20260925120000_official_voices.sql` before pushing the new schema-dependent code, in one transaction with bounded lock and statement timeouts.
- Verified `characters.voice_id` exists and is nullable; `official_voices` contains **0 rows**.
- Verified RLS is enabled and both `anon` and `authenticated` have no direct SELECT permission on `official_voices`.
- Existing production health endpoint remained healthy after the additive migration.
- No voice was registered, approved or activated during this merge.

## Remaining limitations

- Production TTS does not consume the selected local Chatterbox voice yet. Existing Gemini call behavior is unchanged.
- Actual recording registration, Korean pronunciation/similarity review and production voice playback remain unfinished.
- This record verifies code integration and schema compatibility; it does not claim a new Vercel application deployment or real voice-generation success.
