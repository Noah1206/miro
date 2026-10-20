"""
몰입 모드 음성 합성 서버를 Modal(서버리스 GPU)에 올린다 — gsv_server.py 를 그대로 T4 컨테이너 안에서 돌린다.

  배포:   cd ~/Desktop/Miro && ~/GPT-SoVITS/venv/bin/modal deploy tooling/voice/modal_app.py
  목소리: ~/GPT-SoVITS/venv/bin/modal volume put miro-voices ~/.miro/voices/gsv/voices/<해시> /<해시>
  비밀값: ~/GPT-SoVITS/venv/bin/modal secret create miro-tts MIRO_TTS_API_KEY=<키> MIRO_TTS_DEFAULT_VOICE=<해시>
  앱 연결: Vercel env MIRO_TTS_URL=<배포 URL>  MIRO_TTS_API_KEY=<같은 키>

요청이 없으면 컨테이너가 내려가 비용 0 이고(무료 크레딧 안), 식은 뒤 첫 요청은 모델 로드 때문에 20~30초 걸린다.
ponytail: 컨테이너 하나가 요청을 순서대로 처리한다(gsv_server 의 lock). 유저가 늘면 max_containers 만 올린다.
"""
import os
import subprocess

import modal

GSV_COMMIT = "b4570b8"  # 맥·Colab 과 같은 GPT-SoVITS 커밋
PRETRAINED = ["gsv-v2final-pretrained/*", "chinese-hubert-base/*", "chinese-roberta-wwm-ext-large/*"]  # v2 한국어 최소 세트

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "wget")
    .run_commands(f"git clone -q https://github.com/RVC-Boss/GPT-SoVITS.git /gsv && cd /gsv && git checkout -q {GSV_COMMIT}")
    .pip_install("torch==2.7.0", "torchaudio==2.7.0", index_url="https://download.pytorch.org/whl/cu126")
    # gradio 4.44.1/gradio_client 1.3.0 고정: 더 새 gradio_client 는 serializing 모듈이 없어 전처리·추론 import 가 죽는다(10/20 Colab 실측)
    .run_commands("cd /gsv && pip install -q -r requirements.txt 'starlette<1.0' huggingface_hub 'gradio==4.44.1' 'gradio_client==1.3.0'")
    .run_commands(
        "cd /gsv && python -c \"from huggingface_hub import snapshot_download as s; "
        f"s('lj1995/GPT-SoVITS', allow_patterns={PRETRAINED!r}, local_dir='GPT_SoVITS/pretrained_models')\"",
        # 한국어·일본어 텍스트 전처리(LangSegmenter)가 요구하는 fastText 언어 판별 모델
        "mkdir -p /gsv/GPT_SoVITS/pretrained_models/fast_langdetect && wget -q -O /gsv/GPT_SoVITS/pretrained_models/fast_langdetect/lid.176.bin "
        "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin",
        # 영어 단어 g2p 가 쓰는 NLTK 자료 — 없으면 한국어 문장도 LookupError 로 전부 실패한다
        "python -c \"import nltk; [nltk.download(r, quiet=True) for r in ['cmudict', 'averaged_perceptron_tagger', 'averaged_perceptron_tagger_eng']]\"",
    )
    .add_local_file(os.path.join(os.path.dirname(__file__), "gsv_server.py"), "/gsv/gsv_server.py")
)

voices = modal.Volume.from_name("miro-voices", create_if_missing=True)
app = modal.App("miro-tts", image=image)


@app.function(
    gpu="T4",
    volumes={"/voices": voices},
    secrets=[modal.Secret.from_name("miro-tts")],
    scaledown_window=600,  # 마지막 요청 뒤 10분은 깨어 있어 대화 중엔 콜드 스타트가 없다
    timeout=600,
)
@modal.concurrent(max_inputs=8)
@modal.web_server(port=8787, startup_timeout=600)
def serve():
    voices.reload()
    cmd = [
        "python", "/gsv/gsv_server.py", "--gsv-root", "/gsv", "--voices-dir", "/voices",
        "--default-voice", os.environ.get("MIRO_TTS_DEFAULT_VOICE", "default"), "--port", "8787",
    ]
    subprocess.Popen(cmd, cwd="/gsv")
