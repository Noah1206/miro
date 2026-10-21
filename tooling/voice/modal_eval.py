"""
GPT 단계 병목 실험(10/21) — 같은 문장·같은 지표로 비교한다.
  A  GPT-SoVITS(여자 1 가중치) 샘플링 값 조합 + 보조 참조 섞기          (T4, modal_train 이미지)
  C  Qwen3-TTS 1.7B: 제로샷(속삭임 참조) / 같은 정제 데이터로 파인튜닝    (L4 — bf16 필요)
지표: spk = 원본 조각과 resemblyzer 코사인(높을수록 그 사람), cer = faster-whisper large-v3 받아쓰기 vs 정답 글자 오류율(낮을수록 또렷)
  modal run modal_eval.py --voice woman-1            → Volume /_eval/<voice>/{A_*,C_*}/*.wav, results.json
"""
import json
import os
import re

import modal

from modal_train import image as _train_image, voices

gsv_image = _train_image.add_local_python_source("modal_train")  # 컨테이너 안에서도 modal_train·modal_app 을 import 한다

qwen_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "sox")
    .pip_install("torch==2.7.0", "torchaudio==2.7.0", index_url="https://download.pytorch.org/whl/cu126")
    .pip_install("qwen-tts", "soundfile", "librosa", "faster-whisper", "resemblyzer", "accelerate")
    .run_commands("git clone -q --depth 1 https://github.com/QwenLM/Qwen3-TTS.git /qwen3tts")
    .env({"LD_LIBRARY_PATH": "/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib"})
    .pip_install("modal")
    .add_local_python_source("modal_train", "modal_app")
)
app = modal.App("miro-tts-eval")
N_EVAL = 8


def _dataset(voice):
    """Volume 의 정제 데이터셋(dataset.zip)과 참조 후보(refs.json)를 풀어 (조각 목록, 속삭임 참조)를 돌려준다."""
    import zipfile
    d = f"/tmp/ds/{voice}"; os.makedirs(d, exist_ok=True)
    zipfile.ZipFile(f"/voices/_train/{voice}/dataset.zip").extractall(d)
    rows = [l.split("|") for l in open(f"{d}/raw_manhwa_voice.list", encoding="utf8").read().splitlines() if l.count("|") == 3]
    rows = [(f"{d}/Miro_Dataset_Output/{w}", t) for w, *_, t in rows]
    refs = json.load(open(f"/voices/_train/{voice}/refs.json", encoding="utf8"))
    ref = refs.get("whisper") or refs.get("normal")
    ref = (f"{d}/Miro_Dataset_Output/{ref['file']}", ref["text"])
    import soundfile as sf
    evals = [(w, t) for w, t in rows if w != ref[0] and 2.5 <= sf.info(w).duration <= 9 and len(re.findall(r"[가-힣]", t)) >= 6][:N_EVAL]
    return d, rows, ref, evals


class Scorer:
    def __init__(self, device):
        from faster_whisper import WhisperModel
        from resemblyzer import VoiceEncoder
        self.asr = WhisperModel("large-v3", device=device, compute_type="float16" if device == "cuda" else "int8")
        self.enc = VoiceEncoder(device=device, verbose=False)

    def cer(self, ref_text, wav):
        hyp = " ".join(s.text for s in self.asr.transcribe(wav, language="ko", beam_size=5)[0])
        a, b = re.sub(r"[^가-힣]", "", ref_text), re.sub(r"[^가-힣]", "", hyp)
        d = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            prev, d[0] = d[0], i
            for j, cb in enumerate(b, 1):
                prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
        return d[-1] / max(1, len(a))

    def spk(self, orig, wav):
        import numpy as np
        from resemblyzer import preprocess_wav
        return float(np.dot(self.enc.embed_utterance(preprocess_wav(orig)), self.enc.embed_utterance(preprocess_wav(wav))))

    def score(self, pairs):
        """pairs: [(원본 wav, 정답 글자, 합성 wav)] → 평균 spk·cer"""
        s = [self.spk(o, w) for o, _, w in pairs]; c = [self.cer(t, w) for _, t, w in pairs]
        return {"spk": round(sum(s) / len(s), 3), "cer": round(sum(c) / len(c), 3)}


@app.function(image=gsv_image, gpu="T4", volumes={"/voices": voices}, timeout=3600)
def eval_gsv(voice: str) -> dict:
    import sys
    import numpy as np
    import soundfile as sf
    voices.reload()
    d, rows, ref, evals = _dataset(voice)
    sys.path[:0] = ["/gsv", "/gsv/GPT_SoVITS"]; os.chdir("/gsv")
    from TTS_infer_pack.TTS import TTS, TTS_Config
    cfg = TTS_Config("GPT_SoVITS/configs/tts_infer.yaml"); cfg.device = "cuda"; cfg.is_half = True
    tts = TTS(cfg)
    tts.init_t2s_weights(f"/voices/_train/{voice}/gpt.ckpt"); tts.init_vits_weights(f"/voices/_train/{voice}/sovits.pth")
    aux = [w for w, t in rows if w != ref[0] and w not in [e[0] for e in evals] and 3 <= sf.info(w).duration <= 10][:4]
    grid = {
        "A0_base(k15,t1.0,rp1.35)": dict(top_k=15, temperature=1.0, repetition_penalty=1.35),
        "A1_t0.7": dict(top_k=15, temperature=0.7, repetition_penalty=1.35),
        "A2_t0.7_rp1.1": dict(top_k=15, temperature=0.7, repetition_penalty=1.1),
        "A3_k5_t0.6_rp1.1": dict(top_k=5, temperature=0.6, repetition_penalty=1.1),
        "A4_k20_t0.8_rp1.0": dict(top_k=20, temperature=0.8, repetition_penalty=1.0),
        "A5_t0.7_rp1.1_aux4": dict(top_k=15, temperature=0.7, repetition_penalty=1.1, aux_ref_audio_paths=aux),
    }
    sc = Scorer("cuda"); out = {}
    for name, kw in grid.items():
        od = f"/voices/_eval/{voice}/{name.split('(')[0]}"; os.makedirs(od, exist_ok=True); pairs = []
        for i, (w, t) in enumerate(evals):
            req = dict(text=t, text_lang="ko", ref_audio_path=ref[0], prompt_text=ref[1], prompt_lang="ko", text_split_method="cut5",
                       batch_size=1, speed_factor=1.0, streaming_mode=False, parallel_infer=True, return_fragment=False, seed=1234, **kw)
            sr, parts = 32000, []
            for sr, chunk in tts.run(req): parts.append(chunk)
            p = f"{od}/{i:02d}.wav"; sf.write(p, np.concatenate(parts), sr); pairs.append((w, t, p))
        out[name] = sc.score(pairs); print(name, out[name], flush=True)
    # 토큰 복원(천장)·원본 받아쓰기(정답 잡음 수준)도 같은 지표로
    out["orig_vs_label"] = {"cer": round(sum(sc.cer(t, w) for w, t in evals) / len(evals), 3)}
    voices.commit()
    return out


# 1.7B 전체 파인튜닝은 L4(22GB)에서 OOM(10/21) → A100 40GB
@app.function(image=qwen_image, gpu="A100-40GB", volumes={"/voices": voices}, timeout=3600)
def eval_qwen(voice: str, skip_zeroshot: bool = False) -> dict:
    import subprocess
    import soundfile as sf
    import torch
    voices.reload()
    d, rows, ref, evals = _dataset(voice)
    from qwen_tts import Qwen3TTSModel
    out = {}; sc = None

    def run(name, gen):
        nonlocal sc
        sc = sc or Scorer("cuda")  # 채점 모델(large-v3)은 파인튜닝이 끝난 뒤에 올린다 — GPU 메모리
        od = f"/voices/_eval/{voice}/{name}"; os.makedirs(od, exist_ok=True); pairs = []
        for i, (w, t) in enumerate(evals):
            wavs, sr = gen(t); p = f"{od}/{i:02d}.wav"; sf.write(p, wavs[0], sr); pairs.append((w, t, p))
        out[name] = sc.score(pairs); print(name, out[name], flush=True)

    base = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    if not skip_zeroshot:
        m = Qwen3TTSModel.from_pretrained(base, device_map="cuda:0", dtype=torch.bfloat16)
        prompt = m.create_voice_clone_prompt(ref_audio=ref[0], ref_text=ref[1])
        run("C1_qwen_zeroshot", lambda t: m.generate_voice_clone(text=t, language="Korean", voice_clone_prompt=prompt))
        del m; sc = None; torch.cuda.empty_cache()

    # 파인튜닝: 같은 정제 데이터 전부(평가 문장 포함 — GPT-SoVITS 도 전부로 학습했으니 같은 조건), 참조는 하나로 고정(공식 권장)
    ft = f"/tmp/qwen_ft/{voice}"; os.makedirs(ft, exist_ok=True)
    import librosa
    def to24(p):  # Qwen3-TTS 토크나이저는 24kHz 만 받는다
        q = f"{ft}/wav24/{os.path.basename(p)}"; os.makedirs(os.path.dirname(q), exist_ok=True)
        if not os.path.exists(q): sf.write(q, librosa.load(p, sr=24000, mono=True)[0], 24000)
        return q
    ref24 = to24(ref[0])
    with open(f"{ft}/raw.jsonl", "w", encoding="utf8") as fh:
        for w, t in rows: fh.write(json.dumps({"audio": to24(w), "text": t, "ref_audio": ref24}, ensure_ascii=False) + "\n")
    cwd = "/qwen3tts/finetuning"
    # 공식 스크립트가 flash_attention_2 를 고정으로 요구한다(설치 무거움) → PyTorch 기본 sdpa 로
    subprocess.run(["sed", "-i", "s/flash_attention_2/sdpa/g", "sft_12hz.py", "prepare_data.py"], cwd=cwd, check=False)
    subprocess.run(["python", "prepare_data.py", "--device", "cuda:0", "--tokenizer_model_path", "Qwen/Qwen3-TTS-Tokenizer-12Hz",
                    "--input_jsonl", f"{ft}/raw.jsonl", "--output_jsonl", f"{ft}/codes.jsonl"], cwd=cwd, check=True)
    from huggingface_hub import snapshot_download
    base_local = snapshot_download(base)  # sft 스크립트가 저장할 때 설정 파일을 init 경로에서 복사한다 — 로컬 폴더여야 함(10/21)
    subprocess.run(["python", "sft_12hz.py", "--init_model_path", base_local, "--output_model_path", f"{ft}/out", "--train_jsonl", f"{ft}/codes.jsonl",
                    "--batch_size", "1", "--lr", "2e-5", "--num_epochs", "3", "--speaker_name", "miro"], cwd=cwd, check=True)
    ck = sorted((c for c in os.listdir(f"{ft}/out") if c.startswith("checkpoint-epoch-")), key=lambda c: int(c.rsplit("-", 1)[1]))[-1]
    m = Qwen3TTSModel.from_pretrained(f"{ft}/out/{ck}", device_map="cuda:0", dtype=torch.bfloat16)
    run("C2_qwen_finetuned", lambda t: m.generate_custom_voice(text=t, speaker="miro"))
    voices.commit()
    return out


@app.local_entrypoint()
def main(voice: str = "woman-1", only: str = ""):
    a = eval_gsv.spawn(voice) if only in ("", "gsv") else None
    c = eval_qwen.spawn(voice, only == "qwen") if only in ("", "qwen") else None
    res = {"gsv": a.get() if a else None, "qwen": c.get() if c else None}
    print(json.dumps(res, ensure_ascii=False, indent=1))
