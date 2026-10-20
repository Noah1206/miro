"""
GPT-SoVITS 파인튜닝을 Modal 에서 돌린다 — 합성 서버와 같은 이미지, train_miro.py 그대로. Colab 이 막혔을 때·여러 목소리를 한 번에 돌릴 때.

  데이터:  modal volume put miro-voices <이름>.zip /_datasets/<이름>.zip   (zip 안: <이름>/Miro_Dataset_Output/*.wav, <이름>/raw.list, <이름>/ref.wav, <이름>/ref.txt)
           modal volume put miro-voices ~/GPT-SoVITS/train_miro.py /_datasets/train_miro.py
  실행:    modal run tooling/voice/modal_train.py --names template_2,template_3,template_4      (이름마다 컨테이너 하나, 병렬)
  결과:    Volume /_train/<이름>/{sovits.pth,gpt.ckpt,ref.wav,ref.txt}  →  modal volume get miro-voices /_train/<이름> ~/.miro/voices/gsv/voices/
           그 다음 pnpm voice:gsv register … (폴더가 해시 이름으로 바뀜) → modal volume put miro-voices <해시 폴더> /<해시>

GPU 는 결제 수단이 있어야 해서(10/20) 기본은 CPU 16코어·fp32·batch 1(train_miro 의 CPU 경로). 12분 데이터 기준 수 시간.
카드 등록 뒤: MIRO_TTS_GPU=T4 modal run … 으로 같은 파일을 GPU 로.
"""
import os
import modal

from modal_app import image as base_image, voices  # 합성 서버와 같은 이미지·같은 Volume

GPU = os.environ.get("MIRO_TTS_GPU") or None
image = base_image.add_local_python_source("modal_app")  # 컨테이너 안에서도 이 파일이 modal_app 을 import 한다
app = modal.App("miro-tts-train", image=image)


@app.function(gpu=GPU, cpu=2.0 if GPU else 16.0, memory=32768, volumes={"/voices": voices}, timeout=24 * 3600)
def train(name: str) -> str:
    import glob, shutil, subprocess, zipfile
    voices.reload()
    ds = f"/tmp/ds"; os.makedirs(ds, exist_ok=True)
    zipfile.ZipFile(f"/voices/_datasets/{name}.zip").extractall(ds)
    env = dict(os.environ, GSV_ROOT="/gsv", GSV_EXP=name, GSV_LIST=f"{ds}/{name}/raw.list", GSV_WAVS=f"{ds}/{name}/Miro_Dataset_Output",
               GSV_GPU="1" if GPU else "0", OMP_NUM_THREADS=str(16 if not GPU else 2), NLTK_ALLOW_PROXIED_URLOPEN="1")
    os.makedirs(f"/voices/_train/{name}", exist_ok=True)
    # 단계·에폭 줄은 바로 Modal 로그로(진행 확인용), 전체는 Volume 의 .log 로(실패 원인 확인용)
    p = subprocess.Popen(["python", "-u", "/voices/_datasets/train_miro.py"], cwd="/gsv", env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    with open(f"/voices/_train/{name}.log", "w") as log:
        for line in p.stdout:
            log.write(line)
            if line.startswith(("STEP", "DATA", "WEIGHTS", "ALL")) or "Epoch" in line or "Traceback" in line or "Error" in line:
                print(f"[{name}] {line.rstrip()[:200]}", flush=True)
    rc = p.wait()
    if rc != 0:
        voices.commit(); return f"{name}: FAILED rc={rc} (log: /_train/{name}.log)"
    sov = max(glob.glob(f"/gsv/SoVITS_weights_v2/{name}_e*.pth"), key=os.path.getmtime)
    gpt = max(glob.glob(f"/gsv/GPT_weights_v2/{name}-e*.ckpt"), key=os.path.getmtime)
    out = f"/voices/_train/{name}"
    shutil.copy(sov, f"{out}/sovits.pth"); shutil.copy(gpt, f"{out}/gpt.ckpt")
    shutil.copy(f"{ds}/{name}/ref.wav", f"{out}/ref.wav"); shutil.copy(f"{ds}/{name}/ref.txt", f"{out}/ref.txt")
    voices.commit()
    return f"{name}: ok → {out} ({os.path.basename(sov)}, {os.path.basename(gpt)})"


@app.local_entrypoint()
def main(names: str = "template_2,template_3,template_4"):
    calls = [train.spawn(n) for n in names.split(",")]
    for c in calls: print(c.get())
