"""시란 그림체 LoRA — lora_train.py(거르기·복구·$5 가드)를 Modal 에서 돌리는 래퍼 (11/1).

  modal volume put miro-image-train <siran-stage> /siran/raw          # 사진 3,271장(여자캐릭터-시란, 여자캐릭터-시란2)
  modal run tooling/image/modal_lora.py::tag                          # L4 로 태깅·거르기
  modal deploy tooling/image/modal_lora.py                            # 복구 페이지(…-review.modal.run/?token=…)
  modal run --detach tooling/image/modal_lora.py::train               # H100 학습, 끝나면 /siran/out/siran_v1.safetensors
  modal volume get miro-image-train /siran/out/siran_v1.safetensors output/lora/

비용 상한 $5 는 lora_train.py 가 /vol/siran/budget.json 에 단계 합산으로 지킨다.
복구 페이지 토큰 = ~/.miro/lora-review-token (처음 deploy 때 만든다).
"""
import os, secrets, subprocess
from pathlib import Path
import modal

HERE = Path(__file__).parent
app = modal.App('miro-lora')
vol = modal.Volume.from_name('miro-image-train', create_if_missing=True)
TOKEN_FILE = Path.home() / '.miro' / 'lora-review-token'
if modal.is_local() and not TOKEN_FILE.exists():
    TOKEN_FILE.parent.mkdir(exist_ok=True); TOKEN_FILE.write_text(secrets.token_urlsafe(16))
token = modal.Secret.from_dict({'REVIEW_TOKEN': TOKEN_FILE.read_text().strip()} if modal.is_local() else {})

image = (modal.Image.debian_slim(python_version='3.10').apt_install('git', 'libgl1', 'libglib2.0-0')
         .pip_install('torch==2.4.1', 'torchvision==0.19.1', index_url='https://download.pytorch.org/whl/cu124')
         .run_commands('git clone --depth 1 --branch v0.9.1 https://github.com/kohya-ss/sd-scripts /workspace/sd-scripts',
                       'cd /workspace/sd-scripts && pip install -r requirements.txt bitsandbytes huggingface_hub')
         .pip_install('numpy==1.26.4', 'onnxruntime-gpu==1.21.0', 'pandas', 'pillow')   # torch 가 numpy 2 를 깔면 opencv 4.8 이 못 읽는다
         .env({'SIRAN_ROOT': '/vol/siran'})
         .add_local_file(HERE / 'lora_train.py', '/app/lora_train.py'))


def run(*args, price, run_name='siran'):
    vol.reload()
    env = {**os.environ, 'GPU_PRICE_PER_HOUR': price, 'LORA_RUN': run_name}   # 학습 묶음(lora_train.RUNS) — 예: --run-name gda
    code = subprocess.run(['python', '/app/lora_train.py', *args], env=env).returncode
    vol.commit()
    if code:
        raise RuntimeError(f'{args[0]} exit {code}')


@app.function(gpu='L4', image=image, volumes={'/vol': vol}, timeout=2 * 3600)
def tag(run_name: str = 'siran'):
    run('selftest', price='0.80', run_name=run_name); run('tag', price='0.80', run_name=run_name)


@app.function(gpu='H100', image=image, volumes={'/vol': vol}, timeout=3 * 3600, retries=1)
def train(run_name: str = 'siran', with_tag: bool = False):
    if with_tag:   # 11/2: 맥북을 닫아도 되게 태깅부터 학습까지 클라우드 한 번에(--with-tag, --detach 와 같이)
        run('selftest', price='3.95', run_name=run_name); run('tag', price='3.95', run_name=run_name)
    run('train', price='3.95', run_name=run_name)   # 선점되면 다시 시작해 마지막 저장(500회마다)에서 이어서


@app.function(image=image, volumes={'/vol': vol}, secrets=[token], scaledown_window=300)
@modal.concurrent(max_inputs=50)
@modal.web_server(8000, startup_timeout=60)
def review():
    subprocess.Popen(['python', '/app/lora_train.py', 'review', '--port', '8000'])
