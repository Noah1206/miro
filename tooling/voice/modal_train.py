"""
GPT-SoVITS 데이터 정제 + 파인튜닝을 Modal GPU(T4)에서 돌린다 — 워커(tooling/voice/worker.ts, MIRO_TRAINER=modal)가 호출. 합성 서버와 같은 이미지(modal_app.py) 위에 정제 도구를 얹는다.
  원본 경로(기본, 10/21):  Volume /_raw/<id>/*.m4a|wav  →  prepare_dataset.py(demucs·슬라이서·faster-whisper·화자 필터)  →  train_miro.py
      modal run modal_train.py --names <id>
  zip 경로(맥에서 이미 정제한 데이터셋):  Volume /_datasets/<id>.zip (Miro_Dataset_Output/*.wav + raw_manhwa_voice.list)
      modal run modal_train.py --names <id> --from-zip
  출력:  Volume /_train/<id>/{sovits.pth,gpt.ckpt,train.log,report.json}
  받기:  modal volume get miro-voices /_train/<id>/sovits.pth <폴더>/
비용: T4 가 가장 싼 GPU. 정제 3~5분 + 학습 3~6분 → 목소리당 몇백 원. 안 돌면 0. timeout 1시간.
  GPU 없이(카드 없을 때)는 MIRO_TTS_GPU=cpu — 8코어 CPU, 수 시간.
"""
import os
import modal

from modal_app import image as base_image, voices  # 합성 서버와 같은 이미지·같은 Volume

GPU = os.environ.get("MIRO_TTS_GPU", "T4")
GPU = None if GPU.lower() == "cpu" else GPU
HERE = os.path.dirname(__file__)
image = (
    base_image
    # 정제 도구: demucs(보컬 분리)·faster-whisper(전사)·resemblyzer(화자 임베딩)·pyloudnorm(음량). 모델은 이미지에 미리 받아 둔다(컨테이너마다 3GB 다시 받지 않게)
    .pip_install("demucs", "faster-whisper", "resemblyzer", "pyloudnorm", "panns-inference")
    .run_commands(
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs')\"",
        "python -c \"from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8')\"",
        "python -c \"from resemblyzer import VoiceEncoder; VoiceEncoder(device='cpu', verbose=False)\"",
        # PANNs(AudioSet 527종 소리 판별) 가중치·라벨 — 효과음이 겹친 조각을 거른다
        "python -c \"from panns_inference import AudioTagging; AudioTagging(checkpoint_path=None, device='cpu')\"",
    )
    # faster-whisper(ctranslate2)는 libcublas.so.12·cudnn 을 시스템 경로에서 찾는다 — torch cu126 이 pip 으로 깔아 둔 것을 가리킨다(10/21 libcublas not found)
    .env({"LD_LIBRARY_PATH": "/usr/local/lib/python3.10/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.10/site-packages/nvidia/cudnn/lib"})
    .add_local_python_source("modal_app")
    .add_local_file(os.path.join(HERE, "train_miro.py"), "/gsv/train_miro.py")
    .add_local_file(os.path.join(HERE, "prepare_dataset.py"), "/gsv/prepare_dataset.py")
)
app = modal.App("miro-tts-train", image=image)


def _run(cmd, log_path, tag, keep):
    """자식 프로세스를 돌리며 고른 줄은 Modal 로그로, 전체는 파일로."""
    import subprocess
    with open(log_path, "a") as log:
        p = subprocess.Popen(cmd, cwd="/gsv", env=dict(os.environ, GSV_ROOT="/gsv", NLTK_ALLOW_PROXIED_URLOPEN="1", **_run.env), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in p.stdout:
            log.write(line)
            if line.startswith(keep) or "Traceback" in line or "Error" in line:
                print(f"[{tag}] {line.rstrip()[:220]}", flush=True)
        return p.wait()
_run.env = {}


@app.function(gpu=GPU, cpu=2.0 if GPU else 8.0, memory=16384, volumes={"/voices": voices}, timeout=3600)
def train(name: str, from_zip: bool = False) -> str:
    import glob, shutil, zipfile
    voices.reload()
    exp = name.replace("-", "_")
    ds = f"/tmp/ds/{name}"; os.makedirs(ds, exist_ok=True)
    out = f"/voices/_train/{name}"; os.makedirs(out, exist_ok=True)
    log = f"{out}/train.log"; open(log, "w").close()
    _run.env = {"MIRO_DEVICE": "cuda" if GPU else "cpu"}
    if from_zip:
        zipfile.ZipFile(f"/voices/_datasets/{name}.zip").extractall(ds)
    else:
        raw = f"/voices/_raw/{name}"
        if not os.path.isdir(raw) or not os.listdir(raw): raise RuntimeError(f"{name}: /_raw/{name}/ 에 원본 오디오가 없습니다")
        rc = _run(["python", "-u", "/gsv/prepare_dataset.py", raw, ds, exp], log, name, ("PREP",))
        for f in ("report.json", "refs.json"):
            if os.path.exists(f"{ds}/{f}"): shutil.copy(f"{ds}/{f}", f"{out}/{f}")
        voices.commit()
        if rc != 0: raise RuntimeError(f"{name}: 데이터 정제 실패 rc={rc} (log: /_train/{name}/train.log)")
    wavs = f"{ds}/Miro_Dataset_Output"
    src = f"{ds}/raw_manhwa_voice.list"
    lines = [l for l in open(src, encoding="utf8").read().splitlines() if l.count("|") == 3]
    lines = [os.path.join(wavs, os.path.basename(l.split("|")[0])) + "|" + "|".join(l.split("|")[1:]) for l in lines]
    open(src, "w", encoding="utf8").write("\n".join(lines) + "\n")
    print(f"[{name}] 조각 {len(lines)}개로 학습, gpu={GPU}", flush=True)
    _run.env = {"GSV_EXP": exp, "GSV_LIST": src, "GSV_WAVS": wavs, "GSV_GPU": "1" if GPU else "0", "OMP_NUM_THREADS": "8" if not GPU else "2"}
    rc = _run(["python", "-u", "/gsv/train_miro.py"], log, name, ("STEP", "DATA", "WEIGHTS", "ALL"))
    if rc != 0:
        voices.commit(); raise RuntimeError(f"{name}: 학습 실패 rc={rc} (log: /_train/{name}/train.log)")
    sov = max(glob.glob(f"/gsv/SoVITS_weights_v2/{exp}_e*.pth"), key=os.path.getmtime)
    gpt = max(glob.glob(f"/gsv/GPT_weights_v2/{exp}-e*.ckpt"), key=os.path.getmtime)
    shutil.copy(sov, f"{out}/sovits.pth"); shutil.copy(gpt, f"{out}/gpt.ckpt")
    # 정제된 데이터셋도 남긴다 — 워커가 참조 조각(ref.wav)을 여기서 고른다. list 경로는 파일 이름만(맥에서 다시 붙인다)
    with zipfile.ZipFile(f"{out}/dataset.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("raw_manhwa_voice.list", "\n".join(os.path.basename(l.split("|")[0]) + "|" + "|".join(l.split("|")[1:]) for l in lines) + "\n")
        for l in lines: z.write(l.split("|")[0], "Miro_Dataset_Output/" + os.path.basename(l.split("|")[0]))
    voices.commit()
    return f"{name}: ok → {out} ({os.path.basename(sov)}, {os.path.basename(gpt)})"


@app.function(gpu=GPU, cpu=2.0, memory=8192, volumes={"/voices": voices}, timeout=1200)
def restyle(name: str) -> dict:
    """옛 정제로 만든 목소리에 말투(속삭임/보통) 참조·보조 참조 목록(refs.json)을 다시 만든다 — 재학습 없이."""
    import json, shutil, subprocess, zipfile
    voices.reload()
    ds = f"/tmp/rs/{name}"; os.makedirs(ds, exist_ok=True)
    zipfile.ZipFile(f"/voices/_train/{name}/dataset.zip").extractall(ds)
    subprocess.run(["python", "-u", "/gsv/prepare_dataset.py", "--restyle", ds], cwd="/gsv", check=True, env=dict(os.environ, GSV_ROOT="/gsv", MIRO_DEVICE="cuda" if GPU else "cpu"))
    shutil.copy(f"{ds}/refs.json", f"/voices/_train/{name}/refs.json"); voices.commit()
    return json.load(open(f"{ds}/refs.json", encoding="utf8"))


@app.local_entrypoint()
def main(names: str, from_zip: bool = False, restyle_only: bool = False):
    if restyle_only:
        for n, r in zip(names.split(","), restyle.map(names.split(","))): print(n, r)
        return
    calls = [train.spawn(n, from_zip) for n in names.split(",")]
    for c in calls: print(c.get())
