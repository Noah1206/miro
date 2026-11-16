"""11/17 음성 모드 효과음 후보 만들기 — Stable Audio Open 1.0(diffusers) on Modal L4.
젖은 소리 3단계(wet-1 살짝·wet-2 질척·wet-3 흥건/넘침) + 살 부딪는 소리(slap), 종류마다 4개씩 8초.
모델은 Hugging Face 라이선스 동의가 필요하다: Modal secret 'hf' 에 HF_TOKEN.
실행: modal run tooling/voice/modal_sfx_gen.py   → output/sfx-candidates/<종류>-<n>.wav
"""
import pathlib
import modal

app = modal.App('miro-sfx-gen')
image = modal.Image.debian_slim(python_version='3.11').pip_install(
    'torch==2.4.1', 'diffusers==0.31.0', 'transformers==4.46.3', 'accelerate==1.1.1', 'soundfile==0.12.1', 'torchsde==0.2.6')
cache = modal.Volume.from_name('miro-hf-cache', create_if_missing=True)

NEG = 'music, melody, voice, speech, singing, talking, low quality, noise, hiss'
PROMPTS = {
    'wet-1': 'soft slow wet squishing sounds, gentle slippery friction, rhythmic, close-up foley, intimate, no music',
    'wet-2': 'wet squelching sounds, sticky slippery friction, steady rhythmic pumping, close-up foley, no music',
    # 11/17 사용자: 흐르는 느낌 말고 쏟아져 나오는 느낌으로 다시
    'wet-3': 'thick wet squelching with liquid suddenly gushing and spurting out in bursts, sloppy splashing squirts, rhythmic, close-up foley, no music',
    'slap': 'rhythmic skin slapping, flesh clapping against flesh, steady pace, close-up foley, no music',
}
VARIANTS, SECONDS = 4, 8.0


@app.function(image=image, gpu='L4', timeout=1800, volumes={'/root/.cache/huggingface': cache},
              secrets=[modal.Secret.from_name('hf')])
def generate(only: str = '', seed: int = 17) -> dict[str, bytes]:
    import io
    import torch
    import soundfile as sf
    from diffusers import StableAudioPipeline
    pipe = StableAudioPipeline.from_pretrained('stabilityai/stable-audio-open-1.0', torch_dtype=torch.float16).to('cuda')
    out = {}
    for name, prompt in PROMPTS.items():
        if only and name not in only.split(','):
            continue
        g = torch.Generator('cuda').manual_seed(seed)
        audios = pipe(prompt, negative_prompt=NEG, num_inference_steps=150, audio_end_in_s=SECONDS,
                      num_waveforms_per_prompt=VARIANTS, generator=g).audios
        for i, a in enumerate(audios, 1):
            buf = io.BytesIO()
            sf.write(buf, a.T.float().cpu().numpy(), pipe.vae.sampling_rate, format='WAV')
            out[f'{name}-{i}'] = buf.getvalue()
    cache.commit()
    return out


@app.local_entrypoint()
def main(only: str = '', seed: int = 17):
    """--only wet-3 --seed 31 처럼 종류만 다시 만들 수 있다(같은 이름 파일을 덮어쓴다)."""
    dest = pathlib.Path(__file__).resolve().parents[2] / 'output' / 'sfx-candidates'
    dest.mkdir(parents=True, exist_ok=True)
    for name, data in generate.remote(only, seed).items():
        (dest / f'{name}.wav').write_bytes(data)
        print(dest / f'{name}.wav')
