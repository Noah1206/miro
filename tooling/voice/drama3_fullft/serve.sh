#!/usr/bin/env bash
set -euo pipefail
: "${MIRO_VOICE_CHECKPOINT:?Set a full BF16 Miro checkpoint directory}"
: "${MIRO_VOICE_API_KEY:?Set a private serving API key}"
test -f "$MIRO_VOICE_CHECKPOINT/MIRO_TRAINING.json"
test -f "$MIRO_VOICE_CHECKPOINT/codec.pth"
python -m drama3_fullft.codec_contract --serving-checkpoint "$MIRO_VOICE_CHECKPOINT"
# Run from the pinned Fish Speech checkout. No public endpoint or GPU job is started by preparing this file.
exec python -m drama3_fullft.serve_native_api
