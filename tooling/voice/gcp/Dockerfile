# 몰입 모드 음성 합성 서버(gsv_server.py)를 Cloud Run GPU(L4)에 올리는 이미지 — Modal 이미지(modal_app.py)와 같은 조합.
# 빌드·배포: tooling/voice/gcp/deploy.sh  (Cloud Build 가 빌드하므로 맥에 Docker 데몬이 없어도 된다)
FROM python:3.10-slim-bookworm

ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 DEBIAN_FRONTEND=noninteractive
# build-essential: requirements 의 jieba-fast 가 C 확장이라 gcc 없이는 빌드 실패(10/21)
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg wget ca-certificates build-essential && rm -rf /var/lib/apt/lists/*

ARG GSV_COMMIT=b4570b8
RUN git clone -q https://github.com/RVC-Boss/GPT-SoVITS.git /gsv && cd /gsv && git checkout -q ${GSV_COMMIT}
WORKDIR /gsv

# Modal 이미지와 같은 설치 경로(uv): pip 는 Cloud Build 에서 flit_core 빌드 의존성을 못 받아 실패했다(10/21)
RUN pip install --upgrade pip uv \
 && uv pip install --system torch==2.7.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu126
# gradio 4.44.1/gradio_client 1.3.0 고정(더 새 gradio_client 는 serializing 모듈이 없어 import 가 죽음), resampy 는 리샘플에 필요(10/20 실측)
RUN uv pip install --system -r requirements.txt 'starlette<1.0' huggingface_hub 'gradio==4.44.1' 'gradio_client==1.3.0' resampy google-cloud-storage

# v2 한국어 최소 사전학습 세트 + fastText 언어 판별 + NLTK 자료(없으면 한국어 문장도 LookupError)
RUN python -c "from huggingface_hub import snapshot_download as s; s('lj1995/GPT-SoVITS', allow_patterns=['gsv-v2final-pretrained/*','chinese-hubert-base/*','chinese-roberta-wwm-ext-large/*'], local_dir='GPT_SoVITS/pretrained_models')" \
 && mkdir -p GPT_SoVITS/pretrained_models/fast_langdetect \
 && wget -q -O GPT_SoVITS/pretrained_models/fast_langdetect/lid.176.bin https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin \
 && python -c "import nltk; [nltk.download(r, quiet=True) for r in ['cmudict','averaged_perceptron_tagger','averaged_perceptron_tagger_eng']]"

COPY gsv_server.py /gsv/gsv_server.py
# 학습 작업(Cloud Run Job): train_miro.py + train_job.py — 같은 이미지로 합성(기본 CMD)과 학습(--command python train_job.py) 둘 다 한다
COPY train_miro.py /gsv/train_miro.py
COPY train_job.py /gsv/train_job.py
# 목소리 폴더는 /voices 에 Cloud Storage 버킷을 마운트한다(deploy.sh) — 새 목소리는 버킷에 올리기만 하면 되고 이미지 재빌드가 없다.
ENV PORT=8787
CMD ["sh", "-c", "python /gsv/gsv_server.py --gsv-root /gsv --voices-dir /voices --default-voice ${MIRO_TTS_DEFAULT_VOICE:-default} --port ${PORT}"]
