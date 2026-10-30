"""RVC(Applio) 학습·변환 — 신음 클립으로 학습하고 대사 클립을 그 음색으로 변환.

단계: help(CLI 인자 확인) → train(전처리·추출·학습·인덱스) → infer(변환)
  modal run tooling/voice/modal_rvc.py --stage help
  modal run tooling/voice/modal_rvc.py --stage train
  modal run tooling/voice/modal_rvc.py --stage infer
볼륨 miro-voices: rvc/moan_train(학습 클립) · rvc/test_in(변환 입력) · rvc/models · rvc/test_out
"""
import subprocess
import modal

app = modal.App("miro-rvc")
vol = modal.Volume.from_name("miro-voices")
APPLIO = "/opt/Applio"
MODEL = "moan"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "build-essential", "libsndfile1")
    .run_commands(
        f"git clone https://github.com/IAHispano/Applio {APPLIO}",
        f"cd {APPLIO} && git rev-parse HEAD",
        f"cd {APPLIO} && pip install --extra-index-url https://download.pytorch.org/whl/cu128 -r requirements.txt",
        f"cd {APPLIO} && python core.py prerequisites",
    )
)


def sh(cmd: str) -> None:
    print("$", cmd, flush=True)
    subprocess.run(cmd, shell=True, cwd=APPLIO, check=True)


@app.function(image=image, timeout=600)
def show_help() -> None:
    for c in ("preprocess", "extract", "train", "index", "infer"):
        sh(f"python core.py {c} --help")


@app.function(image=image, gpu="T4", timeout=3600, volumes={"/vol": vol})
def train(epochs: int = 300, sample_rate: int = 40000, batch: int = 8) -> None:
    ds = "/vol/rvc/moan_train"
    sh(f"python core.py preprocess --model-name {MODEL} --dataset-path {ds} --sample-rate {sample_rate} --cut-preprocess Skip")
    sh(f"python core.py extract --model-name {MODEL} --f0-method rmvpe --sample-rate {sample_rate} --embedder-model contentvec --gpu 0")
    sh(
        f"python core.py train --model-name {MODEL} --sample-rate {sample_rate} --batch-size {batch} "
        f"--total-epoch {epochs} --save-every-epoch 50 --save-only-latest --save-every-weights --pretrained --gpu 0"
    )
    sh(f"python core.py index --model-name {MODEL}")
    sh(f"mkdir -p /vol/rvc/models/{MODEL} && cp -r logs/{MODEL}/* /vol/rvc/models/{MODEL}/")
    vol.commit()


@app.function(image=image, gpu="T4", timeout=1800, volumes={"/vol": vol})
def infer(index_rate: float = 0.5, protect: float = 0.33, src_dir: str = "test_in", out_dir: str = "test_out") -> None:
    import glob, os
    src = f"/vol/rvc/models/{MODEL}"
    pth = sorted(glob.glob(f"{src}/*.pth"), key=os.path.getmtime)
    pth = [p for p in pth if "_" in os.path.basename(p) and not os.path.basename(p).startswith(("G_", "D_"))] or pth
    idx = glob.glob(f"{src}/*.index")
    print("pth", pth, "index", idx)
    os.makedirs(f"/vol/rvc/{out_dir}", exist_ok=True)
    for f in sorted(glob.glob(f"/vol/rvc/{src_dir}/*.wav")):
        out = f"/vol/rvc/{out_dir}/{os.path.basename(f)}"
        sh(
            f"python core.py infer --pitch 0 --index-rate {index_rate} --protect {protect} --f0-method rmvpe "
            f"--input-path {f} --output-path {out} --pth-path {pth[-1]} --index-path {idx[0]} --embedder-model contentvec"
        )
    vol.commit()


@app.local_entrypoint()
def main(stage: str = "help", src_dir: str = "test_in", out_dir: str = "test_out") -> None:
    if stage == "infer":
        infer.remote(src_dir=src_dir, out_dir=out_dir)
    else:
        {"help": show_help, "train": train}[stage].remote()
