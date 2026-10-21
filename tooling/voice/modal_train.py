"""
GPT-SoVITS 파인튜닝을 Modal GPU(T4)에서 돌린다 — 워커(tooling/voice/worker.ts, MIRO_TRAINER=modal)가 호출. 합성 서버와 같은 이미지(modal_app.py).
  입력:  Volume miro-voices /_datasets/<id>.zip   (워커가 만든 그대로: Miro_Dataset_Output/*.wav + raw_manhwa_voice.list)
  출력:  Volume miro-voices /_train/<id>/{sovits.pth,gpt.ckpt,train.log}
  실행:  modal run tooling/voice/modal_train.py --names <id>[,<id>…]      (이름마다 컨테이너 하나, 병렬)
  받기:  modal volume get miro-voices /_train/<id>/sovits.pth <폴더>/
비용(10/21): T4 가 가장 싼 GPU. 조각 100개 기준 5~10분 → 목소리당 몇백 원. 안 돌면 0. timeout 1시간이라 폭주해도 그 이상은 안 나간다.
  GPU 없이(카드 없을 때) 돌리려면 MIRO_TTS_GPU=cpu — 8코어 CPU, 수 시간.
"""
import os
import modal

from modal_app import image as base_image, voices  # 합성 서버와 같은 이미지·같은 Volume

GPU = os.environ.get("MIRO_TTS_GPU", "T4")
GPU = None if GPU.lower() == "cpu" else GPU
image = base_image.add_local_python_source("modal_app").add_local_file(os.path.join(os.path.dirname(__file__), "train_miro.py"), "/gsv/train_miro.py")
app = modal.App("miro-tts-train", image=image)


@app.function(gpu=GPU, cpu=2.0 if GPU else 8.0, memory=16384, volumes={"/voices": voices}, timeout=3600)
def train(name: str) -> str:
    import glob, shutil, subprocess, zipfile
    voices.reload()
    exp = name.replace("-", "_")
    ds = f"/tmp/ds/{name}"; os.makedirs(ds, exist_ok=True)
    zipfile.ZipFile(f"/voices/_datasets/{name}.zip").extractall(ds)
    wavs = f"{ds}/Miro_Dataset_Output"
    # list 의 경로는 맥북 기준 → 컨테이너 경로로
    src = f"{ds}/raw_manhwa_voice.list"
    lines = [l for l in open(src, encoding="utf8").read().splitlines() if l.count("|") == 3]
    lines = [os.path.join(wavs, os.path.basename(l.split("|")[0])) + "|" + "|".join(l.split("|")[1:]) for l in lines]
    open(src, "w", encoding="utf8").write("\n".join(lines) + "\n")
    print(f"[{name}] 조각 {len(lines)}개, gpu={GPU}", flush=True)
    env = dict(os.environ, GSV_ROOT="/gsv", GSV_EXP=exp, GSV_LIST=src, GSV_WAVS=wavs,
               GSV_GPU="1" if GPU else "0", OMP_NUM_THREADS="8" if not GPU else "2", NLTK_ALLOW_PROXIED_URLOPEN="1")
    out = f"/voices/_train/{name}"; os.makedirs(out, exist_ok=True)
    # 단계·에폭 줄은 Modal 로그로(진행 확인용), 전체는 Volume 의 train.log 로(실패 원인 확인용)
    with open(f"{out}/train.log", "w") as log:
        p = subprocess.Popen(["python", "-u", "/gsv/train_miro.py"], cwd="/gsv", env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in p.stdout:
            log.write(line)
            if line.startswith(("STEP", "DATA", "WEIGHTS", "ALL")) or "Epoch" in line or "Traceback" in line or "Error" in line:
                print(f"[{name}] {line.rstrip()[:200]}", flush=True)
        rc = p.wait()
    if rc != 0:
        voices.commit(); raise RuntimeError(f"{name}: 학습 실패 rc={rc} (log: /_train/{name}/train.log)")
    sov = max(glob.glob(f"/gsv/SoVITS_weights_v2/{exp}_e*.pth"), key=os.path.getmtime)
    gpt = max(glob.glob(f"/gsv/GPT_weights_v2/{exp}-e*.ckpt"), key=os.path.getmtime)
    shutil.copy(sov, f"{out}/sovits.pth"); shutil.copy(gpt, f"{out}/gpt.ckpt")
    voices.commit()
    return f"{name}: ok → {out} ({os.path.basename(sov)}, {os.path.basename(gpt)})"


@app.local_entrypoint()
def main(names: str):
    calls = [train.spawn(n) for n in names.split(",")]
    for c in calls: print(c.get())
