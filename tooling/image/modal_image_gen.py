"""미로 이미지 생성 시험 (10/31) — Animagine XL 4.0(CreativeML Open RAIL++-M, 상업 이용 가능)을 Modal 에서.
RunPod 대신 기존 Modal 계정으로 통합. 지금은 시험용 `modal run` 만 — 채팅 생성 버튼용 웹 엔드포인트는 그림체 확정 뒤.

  ~/.miro/voice-venv/bin/modal run tooling/image/modal_image_gen.py --out output/image-test
"""
import modal

MODEL = 'cagliostrolab/animagine-xl-4.0'
app = modal.App('miro-image-gen')
cache = modal.Volume.from_name('miro-image-models', create_if_missing=True)
image = modal.Image.debian_slim(python_version='3.11').pip_install(
    'torch==2.5.1', 'diffusers==0.31.0', 'transformers==4.46.3', 'accelerate', 'safetensors')

NEGATIVE = ('lowres, bad anatomy, bad hands, extra digits, worst quality, low quality, jpeg artifacts, watermark, signature, '
            'child, loli, young, flat chest, nsfw, nude, nipples')


@app.cls(gpu='A10G', image=image, volumes={'/cache': cache}, timeout=900, scaledown_window=60)
class Gen:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import StableDiffusionXLPipeline, EulerAncestralDiscreteScheduler
        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            MODEL, torch_dtype=torch.float16, use_safetensors=True, cache_dir='/cache').to('cuda')
        self.pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(self.pipe.scheduler.config)
        # 그림체 참조(InstantStyle) — 참조 사진의 그림체만 가져오고 인물·구도는 프롬프트대로.
        from transformers import CLIPVisionModelWithProjection
        self.pipe.image_encoder = CLIPVisionModelWithProjection.from_pretrained(
            'h94/IP-Adapter', subfolder='models/image_encoder', torch_dtype=torch.float16, cache_dir='/cache').to('cuda')
        self.pipe.load_ip_adapter('h94/IP-Adapter', subfolder='sdxl_models', weight_name='ip-adapter-plus_sdxl_vit-h.safetensors', cache_dir='/cache')
        cache.commit()

    @modal.method()
    def gen(self, prompt: str, seed: int = 0, width: int = 832, height: int = 1216, steps: int = 28, cfg: float = 5.0,
            style: bytes | None = None, style_scale: float = 1.0) -> bytes:
        import io, torch
        from PIL import Image
        g = torch.Generator('cuda').manual_seed(seed)
        if style:
            self.pipe.set_ip_adapter_scale({'up': {'block_0': [0.0, style_scale, 0.0]}})
            ref = Image.open(io.BytesIO(style)).convert('RGB')
        else:
            self.pipe.set_ip_adapter_scale(0.0)
            ref = Image.new('RGB', (224, 224))
        img = self.pipe(prompt=prompt, negative_prompt=NEGATIVE, width=width, height=height, ip_adapter_image=ref,
                        num_inference_steps=steps, guidance_scale=cfg, generator=g).images[0]
        buf = io.BytesIO()
        img.save(buf, 'PNG')
        return buf.getvalue()


# 남성향 여자 캐릭터 그림체 시험 — 성인 외형, 노출 없음.
TESTS = [
    '1girl, solo, mature female, adult woman, long black hair, office lady, white blouse, looking at viewer, slight smile, upper body, city night bokeh, masterpiece, high score, great score, absurdres',
    '1girl, solo, mature female, adult woman, silver hair, ponytail, black turtleneck, cafe, window light, close-up, soft expression, masterpiece, high score, great score, absurdres',
    '1girl, solo, mature female, adult woman, brown wavy hair, off-shoulder sweater, bedroom, warm lighting, looking at viewer, blush, upper body, masterpiece, high score, great score, absurdres',
    '1girl, solo, mature female, adult woman, pink hair, bob cut, idol stage outfit, stage lights, wink, cowboy shot, masterpiece, high score, great score, absurdres',
]


@app.local_entrypoint()
def main(out: str = 'output/image-test', style: str = '', scale: float = 1.0, tag: str = 'test'):
    import os
    os.makedirs(out, exist_ok=True)
    ref = open(style, 'rb').read() if style else None
    g = Gen()
    for i, data in enumerate(g.gen.map(TESTS, kwargs={'seed': 7, 'style': ref, 'style_scale': scale})):
        path = f'{out}/{tag}-{i + 1}.png'
        open(path, 'wb').write(data)
        print('saved', path)
