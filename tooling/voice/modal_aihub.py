"""
AI Hub 71349(감성 및 발화스타일 동시 고려 음성합성) 원본을 Modal 에서 바로 받아 Volume 에 푼다 — 맥 디스크·회선을 안 쓴다(10/22).
  키: Modal secret 'aihub' 의 AIHUB_API_KEY (사용자 계정의 다운로드 키). 데이터셋은 aihub.or.kr 에서 신청·승인돼 있어야 한다.
  modal run modal_aihub.py --files 007:560103,008:560104      → /_aihub/71349/dialog/<화자>/*.wav, 화자마다 평온(N) 문장 샘플 /_aihub/71349/samples/<화자>.wav
AI Hub 도구(aihubshell)와 같은 요청: GET https://api.aihub.or.kr/down/0.6/<데이터셋>.do?fileSn=<키>  (헤더 apikey) → tar 안에 .zip.partN 조각
"""
import glob
import os
import re
import modal

voices = modal.Volume.from_name("miro-voices", create_if_missing=True)
image = modal.Image.debian_slim(python_version="3.11").apt_install("curl", "unzip").pip_install("soundfile", "numpy")
app = modal.App("miro-aihub")
ROOT = "/voices/_aihub/71349"


@app.function(image=image, secrets=[modal.Secret.from_name("aihub")], volumes={"/voices": voices}, timeout=3600, cpu=2.0, memory=4096)
def fetch(spec: str) -> str:
    import subprocess, shutil, soundfile as sf
    spk, key = spec.split(":")
    work = f"/tmp/{spk}"; os.makedirs(work, exist_ok=True)
    r = subprocess.run(["curl", "-sS", "-L", "-o", f"{work}/d.tar", "-H", f"apikey:{os.environ['AIHUB_API_KEY']}", "-w", "%{http_code}",
                        f"https://api.aihub.or.kr/down/0.6/71349.do?fileSn={key}"], capture_output=True, text=True)
    if r.stdout.strip() != "200": return f"{spk}: 다운로드 실패 HTTP {r.stdout.strip()} {open(f'{work}/d.tar', errors='ignore').read()[:200]}"
    subprocess.run(["tar", "-xf", f"{work}/d.tar", "-C", work], check=True); os.remove(f"{work}/d.tar")
    parts = sorted(glob.glob(f"{work}/**/*.zip.part*", recursive=True), key=lambda f: int(re.search(r"part(\d+)$", f).group(1)))
    z = f"{work}/all.zip"
    with open(z, "wb") as out:
        for p in parts:
            with open(p, "rb") as fh: shutil.copyfileobj(fh, out)
            os.remove(p)
    dst = f"{ROOT}/dialog/{spk}"; shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
    subprocess.run(["unzip", "-q", "-o", "-j", z, "-d", dst], check=True)  # -j: 폴더 없이 파일만
    wavs = sorted(glob.glob(f"{dst}/*.wav"))
    # 샘플: 평온(-N...) 문장 중 4~8초 하나
    os.makedirs(f"{ROOT}/samples", exist_ok=True)
    pick = next((w for w in wavs if "-N" in os.path.basename(w) and 4 <= sf.info(w).duration <= 8), wavs[0] if wavs else None)
    if pick: shutil.copy(pick, f"{ROOT}/samples/{spk}.wav")
    voices.commit()
    return f"{spk}: wav {len(wavs)}개, 예: {[os.path.basename(w) for w in wavs[:3]]}, 샘플 {os.path.basename(pick) if pick else '-'}"


@app.local_entrypoint()
def main(files: str):
    for line in fetch.map(files.split(",")): print(line)
