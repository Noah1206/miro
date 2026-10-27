"""Reference-only Chatterbox V3 / Qwen3 / F5 tests; never trains or runs GPT-SoVITS."""

import json
from pathlib import Path

import modal

app = modal.App("miro-three-tts-compare")
outputs = modal.Volume.from_name("miro-voices")
cache = modal.Volume.from_name("miro-voxcpm2-cache")
SOURCE = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"
cb_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(f"git+https://github.com/resemble-ai/chatterbox.git@{SOURCE}")
    .env({"HF_HOME": "/cache/huggingface", "TQDM_DISABLE": "1"})
)
qwen_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "sox")
    .pip_install("torch==2.7.0", "torchaudio==2.7.0", index_url="https://download.pytorch.org/whl/cu126")
    .pip_install("qwen-tts==0.1.1", "soundfile")
    .env({"HF_HOME": "/cache/huggingface", "TQDM_DISABLE": "1"})
)
f5_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("torch==2.9.1", "torchaudio==2.9.1", "torchcodec==0.8.1")
    .pip_install("f5-tts==1.1.22", "transformers==4.57.6")
    .env({"HF_HOME": "/cache/huggingface", "TQDM_DISABLE": "1"})
)
COMMON = dict(gpu=["L4", "A10", "L40S"], memory=16384,
              volumes={"/voices": outputs, "/cache": cache}, timeout=1200)


def setup(manifest, references, engine):
    import importlib.metadata
    import torch

    out = Path("/voices") / manifest["modal_output"].lstrip("/")
    out.mkdir(parents=True, exist_ok=True)
    ref_dir = Path("/tmp/miro-refs")
    ref_dir.mkdir(exist_ok=True)
    for name, data in references.items():
        (ref_dir / Path(name).name).write_bytes(data)
    report = {"engine": engine, "training": False, "gpu": torch.cuda.get_device_name(),
              "seed": 1234, "items": [], "errors": [], "packages": {}}
    for name in ("torch", "torchaudio", "transformers", "chatterbox-tts", "f5-tts", "qwen-tts", "resemble-perth"):
        try:
            report["packages"][name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            pass
    return out, ref_dir, report


def save_report(out, report):
    (out / f"{report['engine']}_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    outputs.commit()


def save_take(out, report, row, mode, wav, sr, elapsed, settings):
    import numpy as np
    import soundfile as sf

    wav = np.asarray(wav).reshape(-1)
    if not len(wav) or not np.isfinite(wav).all():
        raise ValueError("Empty or non-finite waveform")
    file = f"{row['id']}_{mode}.wav"
    # Float WAV preserves occasional model peaks above 1.0 until playback mastering.
    sf.write(out / file, wav, sr, subtype="FLOAT")
    item = {"id": row["id"], "file": file, "mode": mode, "text": row["text"],
            "sample_rate": sr, "duration_seconds": round(len(wav) / sr, 3),
            "generation_seconds": round(elapsed, 3), "peak": float(np.max(np.abs(wav))),
            "settings": settings}
    report["items"].append(item)
    save_report(out, report)
    print(json.dumps(item, ensure_ascii=False), flush=True)


def seed():
    import random
    import numpy as np
    import torch

    random.seed(1234)
    np.random.seed(1234)
    torch.manual_seed(1234)
    torch.cuda.manual_seed_all(1234)


@app.function(image=cb_image, **COMMON)
def chatterbox(manifest: dict, references: dict[str, bytes]):
    import time
    from huggingface_hub import snapshot_download
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    out, refs, report = setup(manifest, references, "chatterbox")
    revision = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
    path = snapshot_download("ResembleAI/chatterbox", revision=revision,
                             allow_patterns=["ve.pt", "t3_mtl23ls_v3.safetensors", "s3gen.pt",
                                             "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "Cangjie5_TC.json"])
    cache.commit()
    model = ChatterboxMultilingualTTS.from_local(path, "cuda", t3_model="v3")
    report.update(model="Chatterbox Multilingual V3", revision=revision, source_commit=SOURCE,
                  notes="Korean-supported V3. No Turbo-only paralinguistic tags; native PerTh watermark retained.")
    for mode, exaggeration, cfg in [("cb_default", 0.5, 0.5), ("cb_expressive", 0.7, 0.3)]:
        for row in manifest["items"]:
            if manifest.get("repair_files") and f"{row['id']}_{mode}.wav" not in manifest["repair_files"]:
                continue
            try:
                seed()
                t = time.monotonic()
                wav = model.generate(row["text"], language_id="ko",
                                     audio_prompt_path=str(refs / row["reference_file"]),
                                     exaggeration=exaggeration, cfg_weight=cfg)
                save_take(out, report, row, mode, wav.detach().cpu().numpy(), model.sr,
                          time.monotonic() - t, {"exaggeration": exaggeration, "cfg_weight": cfg})
            except Exception as e:
                report["errors"].append({"id": row["id"], "mode": mode, "error": repr(e)})
                save_report(out, report)
    return report


@app.function(image=qwen_image, **COMMON)
def qwen(manifest: dict, references: dict[str, bytes]):
    import time
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    out, refs, report = setup(manifest, references, "qwen")
    variants = [
        ("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "fd4b254389122332181a7c3db7f27e918eec64e3", "qwen_clone"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "0c0e3051f131929182e2c023b9537f8b1c68adfe", "qwen_sohee"),
    ]
    report["models"] = variants
    report["notes"] = "Base is a clone of speaker 007. Sohee is a different built-in Korean female voice with acting instructions, NOT a clone."
    for repo, revision, mode in variants:
        path = snapshot_download(repo, revision=revision)
        cache.commit()
        model = Qwen3TTSModel.from_pretrained(path, device_map="cuda:0", dtype=torch.bfloat16,
                                            attn_implementation="sdpa")
        for row in manifest["items"]:
            try:
                seed()
                t = time.monotonic()
                if mode == "qwen_clone":
                    wavs, sr = model.generate_voice_clone(
                        text=row["text"], language="Korean", ref_audio=str(refs / row["reference_file"]),
                        ref_text=row["reference_text"], max_new_tokens=500)
                    settings = {"reference_file": row["reference_file"], "reference_text": row["reference_text"]}
                else:
                    wavs, sr = model.generate_custom_voice(
                        text=row["text"], language="Korean", speaker="Sohee",
                        instruct=row["qwen_instruction"], max_new_tokens=500)
                    settings = {"speaker": "Sohee", "instruct": row["qwen_instruction"], "clone": False}
                save_take(out, report, row, mode, wavs[0], sr, time.monotonic() - t, settings)
            except Exception as e:
                report["errors"].append({"id": row["id"], "mode": mode, "error": repr(e)})
                save_report(out, report)
        del model
        torch.cuda.empty_cache()
    return report


@app.function(image=f5_image, **COMMON)
def f5(manifest: dict, references: dict[str, bytes]):
    import time
    from huggingface_hub import snapshot_download
    from f5_tts.api import F5TTS

    out, refs, report = setup(manifest, references, "f5")
    revision = "84e5a410d9cead4de2f847e7c9369a6440bdfaca"
    path = Path(snapshot_download("SWivid/F5-TTS", revision=revision,
                                 allow_patterns=["F5TTS_v1_Base/*", "README.md"]))
    vocos = snapshot_download("charactr/vocos-mel-24khz",
                              revision="0feb3fdd929bcd6649e0e7c5a688cf7dd012ef21")
    cache.commit()
    vocab = path / "F5TTS_v1_Base/vocab.txt"
    tokens = set(vocab.read_text().splitlines())
    chars = {c for r in manifest["items"] for c in r["text"] if "가" <= c <= "힣"}
    covered = chars & tokens
    report.update(model="F5TTS_v1_Base (official Chinese/English checkpoint)", revision=revision,
                  scope="Unsupported-language diagnostic only; not a valid Korean quality ranking or production candidate.",
                  weights_license="CC-BY-NC-4.0; no deployment or commercial reuse authorized by this experiment",
                  korean_syllables_in_test=len(chars), korean_syllables_in_vocab=len(covered))
    save_report(out, report)
    model = F5TTS(model="F5TTS_v1_Base", ckpt_file=str(path / "F5TTS_v1_Base/model_1250000.safetensors"),
                  vocab_file=str(vocab), device="cuda", vocoder_local_path=vocos)
    # Two fixed diagnostic sentences, rather than wasting a full Korean batch on an unsupported model.
    for row in [manifest["items"][0], manifest["items"][-1]]:
        if manifest.get("repair_files") and f"{row['id']}_f5_diagnostic.wav" not in manifest["repair_files"]:
            continue
        try:
            t = time.monotonic()
            wav, sr, _ = model.infer(ref_file=str(refs / row["reference_file"]), ref_text=row["reference_text"],
                                     gen_text=row["text"], nfe_step=32, speed=1.0, seed=1234,
                                     remove_silence=False)
            save_take(out, report, row, "f5_diagnostic", wav, sr, time.monotonic() - t,
                      {"nfe_step": 32, "speed": 1.0, "remove_silence": False, "supported_language": False})
        except Exception as e:
            report["errors"].append({"id": row["id"], "mode": "f5_diagnostic", "error": repr(e)})
            save_report(out, report)
    return report


@app.local_entrypoint()
def main(manifest: str, only: str = ""):
    p = Path(manifest).resolve()
    data = json.loads(p.read_text())
    refs = {r["reference_file"]: (p.parent / "references" / r["reference_file"]).read_bytes()
            for r in data["items"]}
    functions = {"chatterbox": chatterbox, "qwen": qwen, "f5": f5}
    calls = {name: fn.spawn(data, refs) for name, fn in functions.items()
             if not only or name in only.split(",")}
    for engine, call in calls.items():
        try:
            report = call.get()
        except Exception as e:
            report = {"engine": engine, "fatal_error": repr(e)}
        report_file = p.parent / f"{engine}_report.json"
        if data.get("repair_files") and report_file.exists():
            previous = json.loads(report_file.read_text())
            merged = {r["file"]: r for r in previous.get("items", [])}
            merged.update({r["file"]: r for r in report.get("items", [])})
            previous["items"] = list(merged.values())
            previous["storage_repair"] = {"files": data["repair_files"],
                "reason": "Same fixed seeds and settings, reconstructed as float WAV to retain model peaks above 1.0; no best-take selection."}
            previous["errors"] += report.get("errors", [])
            report = previous
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(engine, len(report.get("items", [])), "takes", flush=True)
