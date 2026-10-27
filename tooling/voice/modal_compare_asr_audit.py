"""Read-only ASR check of comparison WAVs; it does not generate or train voices."""

import json
from pathlib import Path

import modal

app = modal.App("miro-tts-asr-audit")
volume = modal.Volume.from_name("miro-voices")
cache = modal.Volume.from_name("miro-voxcpm2-cache")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "sox")
    .pip_install("torch==2.7.0", "torchaudio==2.7.0", index_url="https://download.pytorch.org/whl/cu126")
    .pip_install("faster-whisper==1.2.1", "soundfile")
    .env({"HF_HOME": "/cache/huggingface", "LD_LIBRARY_PATH": "/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib"})
)


@app.function(image=image, gpu=["L4", "A10", "L40S"], memory=8192,
              volumes={"/voices": volume, "/cache": cache}, timeout=900)
def audit(manifest):
    import re
    import soundfile as sf
    import numpy as np
    from faster_whisper import WhisperModel

    p = Path("/voices") / manifest["modal_output"].lstrip("/")
    volume.reload()
    model = WhisperModel("large-v3-turbo", device="cuda", compute_type="float16", download_root="/cache/asr")
    cache.commit()
    report = {"model": "faster-whisper large-v3-turbo", "notes": "ASR diagnostic only, not an emotion or naturalness rating.", "items": []}
    for row in manifest["items"]:
        for mode in ("cb_default", "cb_expressive", "qwen_clone", "qwen_sohee", "f5_diagnostic"):
            f = p / f"{row['id']}_{mode}.wav"
            if not f.exists():
                continue
            y, sr = sf.read(f)
            kwargs = {} if mode == "f5_diagnostic" else {"language": "ko"}
            segments, info = model.transcribe(str(f), beam_size=5, vad_filter=False, **kwargs)
            text = " ".join(s.text.strip() for s in segments)
            a = re.sub(r"[^가-힣]", "", row["text"])
            b = re.sub(r"[^가-힣]", "", text)
            d = list(range(len(b) + 1))
            for i, ca in enumerate(a, 1):
                prev, d[0] = d[0], i
                for j, cb in enumerate(b, 1):
                    prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
            report["items"].append({"file": f.name, "expected": row["text"], "transcript": text,
                                    "language": info.language, "cer": round(d[-1] / max(1, len(a)), 3),
                                    "near_full_scale_samples": int(np.sum(np.abs(y) >= 0.9999)),
                                    "sample_count": len(y), "duration_seconds": len(y) / sr})
    (p / "asr_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    volume.commit()
    return report


@app.local_entrypoint()
def main(manifest: str):
    p = Path(manifest).resolve()
    report = audit.remote(json.loads(p.read_text()))
    (p.parent / "asr_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print("Audited", len(report["items"]), "files")
