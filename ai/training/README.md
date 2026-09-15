# Dataset boundary

The application does not train models or export raw database rows. `buildTrainingDataset` in `packages/providers/src/ai/data.ts` accepts explicitly curated candidates.

Required gates: collection consent AND fresh consent at export with the same version; provider output training permission; human privacy review; quality >= 4/5; sensitive-content screening; redaction; deduplication. Exported SFT/DPO rows contain no subject or account IDs. Splits use conversation groups to avoid train/test leakage. DPO requires an explicit reviewed preference; continuing a regenerated answer alone is insufficient.

Operational AI logs contain metadata only. Evaluation samples default off, require separate consent, are redacted and pending review, and expire after 30 days. They are not automatically training candidates. A curator must review names, context-dependent identifiers and sensitive information that regexes cannot reliably detect. Revocation must be rechecked for each export, and dataset version manifests/revocation indexes must remain in a separate access-controlled curation system before any real training.

SLM sequence: router/state classification → memory extraction/summary → Korean character dialogue. Benchmark candidate licenses and provider output terms before marking training permission true. Use the fixed golden cases and a held-out reviewed set; choose a base model only after measuring quality, JSON validity, latency and hardware cost. Training infrastructure, SFT/DPO jobs, GPU serving and model weights are intentionally separate future projects.
