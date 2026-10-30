"""Chatterbox VC(제로샷 보이스 체인저) — 신음 클립을 목표 목소리로 바꾼다. 학습 없음.

ComfyUI TTS Audio Suite 의 보이스 체인저 노드와 같은 엔진(chatterbox-tts).
  modal run tooling/voice/modal_vc.py --target rvc/vc_target/breath13_daily.wav
볼륨 miro-voices: rvc/moan_train(입력 110개) → rvc/vc_out/<이름>.wav + rvc/vc_out.zip
"""
import modal

app = modal.App("miro-vc")
vol = modal.Volume.from_name("miro-voices")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("chatterbox-tts==0.1.7")
)


@app.function(image=image, gpu="T4", timeout=1800, volumes={"/vol": vol})
def convert(target: str, src_dir: str = "rvc/moan_train", out_dir: str = "rvc/vc_out") -> int:
    import glob, os, shutil
    import torchaudio as ta
    from chatterbox.vc import ChatterboxVC

    model = ChatterboxVC.from_pretrained("cuda")
    os.makedirs(f"/vol/{out_dir}", exist_ok=True)
    files = sorted(glob.glob(f"/vol/{src_dir}/*.wav"))
    for f in files:
        wav = model.generate(audio=f, target_voice_path=f"/vol/{target}")
        ta.save(f"/vol/{out_dir}/{os.path.basename(f)}", wav, model.sr)
    # 폴더째 받으면 파일이 덮어써지므로 zip 하나로 묶는다.
    shutil.make_archive(f"/vol/{out_dir}", "zip", f"/vol/{out_dir}")
    vol.commit()
    return len(files)


@app.local_entrypoint()
def main(target: str) -> None:
    print("converted", convert.remote(target))
