"""
Cloud Run Job 안에서 목소리 하나를 파인튜닝한다 — 워커(tooling/voice/worker.ts, MIRO_TRAINER=gcp)가 올린 데이터셋 zip 을 받아 train_miro.py 를 돌리고 가중치를 버킷에 올린다.
  입력:  gs://$BUCKET/datasets/<id>.zip   (Miro_Dataset_Output/*.wav + raw_manhwa_voice.list — 워커가 만든 그대로)
  출력:  gs://$BUCKET/weights/<id>/{sovits.pth,gpt.ckpt}  + train.log
  실행:  gcloud run jobs execute miro-train --args <id> --region us-central1 --wait
"""
import glob
import os
import subprocess
import sys
import zipfile

from google.cloud import storage

bucket_name = os.environ["BUCKET"]
voice_id = sys.argv[1]
exp = voice_id.replace("-", "_")
work = f"/tmp/job/{voice_id}"
os.makedirs(work, exist_ok=True)
bucket = storage.Client().bucket(bucket_name)

print(f"[{voice_id}] 데이터셋 내려받기", flush=True)
bucket.blob(f"datasets/{voice_id}.zip").download_to_filename(f"{work}.zip")
zipfile.ZipFile(f"{work}.zip").extractall(work)
wavs = os.path.join(work, "Miro_Dataset_Output")
# list 의 경로는 맥북 기준이라 바구니 안 경로로 바꾼다(train_miro 는 폴더+파일 이름만 쓰지만 안전하게)
src = os.path.join(work, "raw_manhwa_voice.list")
lines = [l for l in open(src, encoding="utf8").read().splitlines() if l.count("|") == 3]
lines = [os.path.join(wavs, os.path.basename(l.split("|")[0])) + "|" + "|".join(l.split("|")[1:]) for l in lines]
open(src, "w", encoding="utf8").write("\n".join(lines) + "\n")
print(f"[{voice_id}] 조각 {len(lines)}개", flush=True)

env = dict(os.environ, GSV_ROOT="/gsv", GSV_EXP=exp, GSV_LIST=src, GSV_WAVS=wavs, GSV_GPU="1", NLTK_ALLOW_PROXIED_URLOPEN="1")
with open(f"{work}/train.log", "w") as log:
    p = subprocess.Popen(["python", "-u", "/gsv/train_miro.py"], cwd="/gsv", env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        log.write(line)
        if line.startswith(("STEP", "DATA", "WEIGHTS", "ALL")) or "Traceback" in line or "Error" in line:
            print(f"[{voice_id}] {line.rstrip()[:200]}", flush=True)
    rc = p.wait()
bucket.blob(f"weights/{voice_id}/train.log").upload_from_filename(f"{work}/train.log")
if rc != 0:
    print(f"[{voice_id}] 학습 실패 rc={rc}", flush=True); sys.exit(1)

sov = max(glob.glob(f"/gsv/SoVITS_weights_v2/{exp}_e*.pth"), key=os.path.getmtime)
gpt = max(glob.glob(f"/gsv/GPT_weights_v2/{exp}-e*.ckpt"), key=os.path.getmtime)
bucket.blob(f"weights/{voice_id}/sovits.pth").upload_from_filename(sov)
bucket.blob(f"weights/{voice_id}/gpt.ckpt").upload_from_filename(gpt)
print(f"[{voice_id}] 가중치 올림: gs://{bucket_name}/weights/{voice_id}/", flush=True)
