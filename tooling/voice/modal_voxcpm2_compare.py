"""Zero-shot VoxCPM2 comparison; reuses existing GPT-SoVITS WAVs locally.

Run with the project's existing Modal CLI:
  modal run --detach tooling/voice/modal_voxcpm2_compare.py --manifest <manifest.json>
No GPT-SoVITS inference or training is performed by this script.
"""

import json
from pathlib import Path

import modal

app = modal.App("miro-voxcpm2-compare")
outputs = modal.Volume.from_name("miro-voices")
cache = modal.Volume.from_name("miro-voxcpm2-cache", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("torch==2.9.1", "torchaudio==2.9.1", "torchcodec==0.8.1")
    .pip_install("voxcpm==2.0.3", "transformers==4.57.6")
    .env({"HF_HOME": "/model-cache/huggingface"})
)


@app.function(
    image=image,
    gpu=["L4", "A10", "L40S"],
    memory=16384,
    volumes={"/voices": outputs, "/model-cache": cache},
    timeout=1200,
)
def generate(manifest: dict, references: dict[str, bytes]) -> dict:
    import importlib.metadata
    import random
    import time

    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from voxcpm import VoxCPM

    out = Path("/voices") / manifest["modal_output"].lstrip("/")
    out.mkdir(parents=True, exist_ok=True)
    ref_dir = Path("/tmp/miro-references")
    ref_dir.mkdir(exist_ok=True)
    for name, data in references.items():
        (ref_dir / Path(name).name).write_bytes(data)
    started = time.monotonic()
    model_path = snapshot_download(
        "openbmb/VoxCPM2", revision=manifest["model_revision"]
    )
    cache.commit()
    model = VoxCPM.from_pretrained(
        model_path, load_denoiser=False, optimize=False, device="cuda"
    )
    report = {
        "model": "openbmb/VoxCPM2",
        "revision": manifest["model_revision"],
        "training": False,
        "gpu": torch.cuda.get_device_name(),
        "packages": {p: importlib.metadata.version(p) for p in
                     ("voxcpm", "torch", "torchaudio", "transformers")},
        "load_seconds": time.monotonic() - started,
        "settings": {"seed": 1234, "cfg_value": 2.0,
                     "inference_timesteps": 10, "max_len": 300,
                     "denoise": False, "normalize": False,
                     "retry_badcase": False, "optimize": False},
        "items": [],
    }
    for mode in ("ultimate", "style"):
        for row in manifest["items"]:
            ref = str(ref_dir / row["reference_file"])
            kwargs = dict(reference_wav_path=ref)
            text = row["text"]
            if mode == "ultimate":
                kwargs.update(prompt_wav_path=ref, prompt_text=row["reference_text"])
            else:
                text = f"({row['style_instruction']}){text}"
            tick = time.monotonic()
            # PyPI 2.0.3 predates the upstream per-call seed parameter.
            random.seed(1234)
            np.random.seed(1234)
            torch.manual_seed(1234)
            torch.cuda.manual_seed_all(1234)
            wav = model.generate(
                text=text, cfg_value=2.0, inference_timesteps=10,
                max_len=300, normalize=False, denoise=False,
                retry_badcase=False, **kwargs,
            )
            elapsed = time.monotonic() - tick
            sr = model.tts_model.sample_rate
            wav = np.asarray(wav).reshape(-1)
            if len(wav) == 0 or not np.isfinite(wav).all():
                raise ValueError(f"Invalid waveform: {row['id']} {mode}")
            name = f"{row['id']}_vox_{mode}.wav"
            sf.write(out / name, wav, sr, subtype="PCM_16")
            result = {
                "id": row["id"], "mode": mode, "file": name,
                "text": row["text"], "model_input": text,
                "reference_file": row["reference_file"],
                "generation_seconds": round(elapsed, 3),
                "duration_seconds": round(len(wav) / sr, 3),
                "sample_rate": sr, "peak": float(np.abs(wav).max()),
                "rtf": round(elapsed / (len(wav) / sr), 3),
            }
            report["items"].append(result)
            (out / "generation_report.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8"
            )
            outputs.commit()
            print(json.dumps(result, ensure_ascii=False), flush=True)
    return report


@app.local_entrypoint()
def main(manifest: str):
    path = Path(manifest).resolve()
    data = json.loads(path.read_text(encoding="utf8"))
    refs = {
        row["reference_file"]: (path.parent / "references" / row["reference_file"]).read_bytes()
        for row in data["items"]
    }
    result = generate.remote(data, refs)
    (path.parent / "generation_report.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8"
    )
    print(f"Saved report: {path.parent / 'generation_report.json'}")
