"""시란 LoRA 시험 생성 (11/1) — 같은 프롬프트·같은 시드로 LoRA 끔(base) / 시란 / 시란2 를 나란히 뽑아 비교한다.
LoRA 는 학습 볼륨(miro-image-train)에서 바로 읽고, 모델은 modal_image_gen.py 가 쓰는 캐시 볼륨(miro-image-models)을 재사용한다.

  modal run tooling/image/modal_lora_test.py                                   # step00002000, 4프롬프트 × 3 = 12장, A10G 약 $0.2
  modal run tooling/image/modal_lora_test.py --ckpt siran_v1-step00001500.safetensors --scale 0.8

결과: output/lora-test/<프롬프트번호>-<base|siran|siran2>.png
"""
from pathlib import Path

import modal

MODEL = 'cagliostrolab/animagine-xl-4.0'
LORA_ROOT = '/vol/siran'   # --ckpt 는 이 아래 경로(예: out-gda/gda_v1.safetensors). 폴더 없이 파일명만 주면 out/ 에서 찾는다
TRIGGER = {'base': '', 'siran': 'siran style, ', 'siran2': 'siran2 style, ', 'gda': 'gda style, ', 'fa': 'fa style, ', 'kdh': 'kdh style, ', 'whif': 'whif style, ', 'mojz': 'mojz style, ', 'itim': 'itim style, ', 'isg': 'isg style, ', 'th': 'th style, '}   # 학습 설명문 맨 앞 트리거(keep_tokens=1)

app = modal.App('miro-lora-test')
cache = modal.Volume.from_name('miro-image-models', create_if_missing=True)
train_vol = modal.Volume.from_name('miro-image-train')
image = modal.Image.debian_slim(python_version='3.11').pip_install(
    'torch==2.5.1', 'diffusers==0.31.0', 'transformers==4.46.3', 'accelerate', 'safetensors', 'peft', 'compel==2.0.3', 'opencv-python-headless')
CONTROLNET = 'xinsir/controlnet-canny-sdxl-1.0'   # 11/4 구도 고정(레퍼런스 윤곽선만, 색은 프롬프트대로)

NEGATIVE_BASE = ('lowres, bad anatomy, bad hands, extra digits, worst quality, low quality, jpeg artifacts, watermark, signature, '
                 'child, loli, young, flat chest')   # 어려 보이는 그림 차단은 언베일에서도 항상 유지
NEGATIVE = NEGATIVE_BASE + ', nsfw, nude, nipples'   # 기본(일반) — --unveil 이면 노출 차단 단어만 뺀다
PROMPTS = [   # modal_image_gen.py 의 시험 프롬프트와 같다 — 성인 외형, 노출 없음
    '1girl, solo, mature female, adult woman, long black hair, office lady, white blouse, looking at viewer, slight smile, upper body, city night bokeh, masterpiece, high score, great score, absurdres',
    '1girl, solo, mature female, adult woman, silver hair, ponytail, black turtleneck, cafe, window light, close-up, soft expression, masterpiece, high score, great score, absurdres',
    '1girl, solo, mature female, adult woman, brown wavy hair, off-shoulder sweater, bedroom, warm lighting, looking at viewer, blush, upper body, masterpiece, high score, great score, absurdres',
    '1girl, solo, mature female, adult woman, pink hair, bob cut, idol stage outfit, stage lights, wink, cowboy shot, masterpiece, high score, great score, absurdres',
]


@app.cls(gpu=['A10G', 'L4', 'A100-40GB'], image=image, volumes={'/cache': cache, '/vol': train_vol}, timeout=900, scaledown_window=60)
class Gen:
    ckpt: str = modal.parameter(default='siran_v1-step00002000.safetensors')

    @modal.enter()
    def load(self):
        import torch
        from diffusers import StableDiffusionXLPipeline, EulerAncestralDiscreteScheduler
        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            MODEL, torch_dtype=torch.float16, use_safetensors=True, cache_dir='/cache').to('cuda')
        self.pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(self.pipe.scheduler.config)
        import os
        folder, name = os.path.split(self.ckpt)
        self.pipe.load_lora_weights(f'{LORA_ROOT}/{folder or "out"}', weight_name=name, adapter_name='siran')
        # 11/2 캐릭터 대표 사진 레퍼런스(IP-Adapter Plus) — 얼굴·머리·그림체를 그 캐릭터 사진에 맞춘다. 레퍼런스가 없으면 세기 0.
        # 두 개: [0] Plus = 그림체·옷까지, [1] Plus-Face = 얼굴·머리만. 언베일은 [0] 을 낮추고 [1] 로 얼굴을 지킨다(옷까지 따라 그려 수위가 약해졌다).
        self.pipe.load_ip_adapter('h94/IP-Adapter', subfolder='sdxl_models',
                                  weight_name=['ip-adapter-plus_sdxl_vit-h.safetensors', 'ip-adapter-plus-face_sdxl_vit-h.safetensors'],
                                  image_encoder_folder='models/image_encoder', cache_dir='/cache')
        # 11/2 긴 프롬프트(Compel) — 그림 모델은 77토큰에서 자르므로 뒤의 장면·부정 단어(인원 제한 등)가 사라졌다. 이어 붙여 전부 읽힌다.
        from compel import Compel, ReturnedEmbeddingsType
        self.compel = Compel(tokenizer=[self.pipe.tokenizer, self.pipe.tokenizer_2], text_encoder=[self.pipe.text_encoder, self.pipe.text_encoder_2],
                             returned_embeddings_type=ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED, requires_pooled=[False, True],
                             truncate_long_prompts=False)

    def _embeds(self, p: str, n: str) -> dict:
        import torch
        with torch.no_grad():
            c, pc = self.compel(p)
            nc, npc = self.compel(n)
            c, nc = self.compel.pad_conditioning_tensors_to_same_length([c, nc])
        return dict(prompt_embeds=c, pooled_prompt_embeds=pc, negative_prompt_embeds=nc, negative_pooled_prompt_embeds=npc)

    @modal.method()
    def gen(self, prompt: str, variant: str, scale: float = 1.0, seed: int = 7, neg: str = '', unveil: bool = False, hires: bool = False,
            hr_scale: float = 0.0, hr_strength: float = 0.4, ref: bytes | None = None, ref_scale: float = 0.0, face_scale: float = 0.0,
            init: bytes | None = None, init_strength: float = 0.65, ctrl: bytes | None = None, ctrl_scale: float = 0.6,
            ctrl_end: float = 0.6, ctrl_top: float = 0.0, redo_top: float = 0.0, redo_prompt: str = '', redo_strength: float = 0.85, redo_from: float = 0.0) -> bytes:
        import io, torch
        from PIL import Image
        if variant == 'base':
            self.pipe.disable_lora()
        else:
            self.pipe.enable_lora()
            self.pipe.set_adapters(['siran'], adapter_weights=[scale])
        g = torch.Generator('cuda').manual_seed(seed)
        # 어려 보임 차단은 부정 프롬프트 맨 앞(잘리더라도 남게).
        p, n = TRIGGER[variant] + prompt, ', '.join(x for x in [NEGATIVE_BASE if unveil else NEGATIVE, neg] if x)
        ref_img = Image.open(io.BytesIO(ref)).convert('RGB') if ref else Image.new('RGB', (224, 224))
        self.pipe.set_ip_adapter_scale([ref_scale, face_scale] if ref else [0.0, 0.0])
        ref_img = [ref_img, ref_img]
        from diffusers import StableDiffusionXLImg2ImgPipeline
        if (hires or init) and not hasattr(self, 'i2i'):
            self.i2i = StableDiffusionXLImg2ImgPipeline(**self.pipe.components)
            self.pipe.enable_vae_tiling()
        if ctrl:   # 11/4 ControlNet: 레퍼런스 윤곽선(canny)으로 구도·손 위치만 고정, 앞쪽 단계(ctrl_end)까지만 걸어 색·머리는 프롬프트대로
            import cv2, numpy as np
            from diffusers import ControlNetModel, StableDiffusionXLControlNetPipeline
            if not hasattr(self, 'cn'):
                net = ControlNetModel.from_pretrained(CONTROLNET, torch_dtype=torch.float16, cache_dir='/cache').to('cuda')
                self.cn = StableDiffusionXLControlNetPipeline.from_pipe(self.pipe, controlnet=net)
            src = np.asarray(Image.open(io.BytesIO(ctrl)).convert('RGB').resize((832, 1216), Image.LANCZOS))
            e = cv2.Canny(src, 100, 200)
            e[:int(e.shape[0] * ctrl_top)] = 0   # 위쪽(머리) 윤곽은 지워서 레퍼런스 머리 모양이 안 따라오게
            edge = Image.fromarray(np.repeat(e[:, :, None], 3, axis=2))
            img = self.cn(**self._embeds(p, n), ip_adapter_image=ref_img, image=edge, controlnet_conditioning_scale=ctrl_scale,
                          control_guidance_end=ctrl_end, width=832, height=1216, num_inference_steps=30, guidance_scale=5.0, generator=g).images[0]
        elif init:   # 11/4 구도 밑그림: 레퍼런스 사진의 구도·손 위치를 그대로 두고 인물·그림체만 다시 그린다
            base = Image.open(io.BytesIO(init)).convert('RGB').resize((832, 1216), Image.LANCZOS)
            img = self.i2i(**self._embeds(p, n), ip_adapter_image=ref_img, image=base, strength=init_strength, num_inference_steps=40,
                           guidance_scale=5.0, generator=g).images[0]
        else:
            img = self.pipe(**self._embeds(p, n), ip_adapter_image=ref_img, width=832, height=1216, num_inference_steps=28, guidance_scale=5.0, generator=g).images[0]
        if redo_top:   # 11/4 2단계: 위쪽(얼굴·머리)만 가리고 윤곽선 없이 다시 칠한다 — 표정·머리색·소품을 인물대로
            from diffusers import StableDiffusionXLInpaintPipeline
            from PIL import ImageFilter
            if not hasattr(self, 'inp'):
                self.inp = StableDiffusionXLInpaintPipeline(**self.pipe.components)
            mask = Image.new('L', img.size, 0)
            if redo_top > 0:
                mask.paste(255, (0, int(img.height * redo_from), img.width, int(img.height * redo_top)))   # redo_from~redo_top 구간(11/4: 하의만 고치기)
            else:   # 음수 = 아래쪽 |redo_top| 만큼 다시 칠한다(손·하체)
                mask.paste(255, (0, int(img.height * (1 + redo_top)), img.width, img.height))
            mask = mask.filter(ImageFilter.GaussianBlur(40))   # 경계 부드럽게
            img = self.inp(**self._embeds(TRIGGER[variant] + (redo_prompt or prompt), n), ip_adapter_image=ref_img, image=img, mask_image=mask,
                           strength=redo_strength, width=img.width, height=img.height, num_inference_steps=35, guidance_scale=5.5, generator=g).images[0]
        if hires:   # 11/2 업스케일 재생성: 1.5배로 키워 약하게(strength 0.4) 다시 그려 작은 부위 디테일을 살린다. 같은 unet 이라 LoRA 도 그대로 걸린다
            up = img.resize((1248, 1824), Image.LANCZOS)
            if hr_scale and variant != 'base':   # 11/2: 1단계는 약하게(몸 형태), 2단계는 강하게(얼굴 그림체를 몸 전체에)
                self.pipe.set_adapters(['siran'], adapter_weights=[hr_scale])
            img = self.i2i(**self._embeds(p, n), ip_adapter_image=ref_img, image=up, strength=hr_strength, num_inference_steps=30,
                           guidance_scale=5.0, generator=g).images[0]
        buf = io.BytesIO()
        img.save(buf, 'PNG')
        return buf.getvalue()


# ---------- 앱 서버(Vercel)가 부르는 주소(11/2) ----------
# POST {key, style, look?, tags, unveil, couple?, extra_neg?, seed?, ref_url?} → {png: base64}. ref_url = 캐릭터 대표 사진(얼굴·그림체 레퍼런스). look = 캐릭터 외형 태그, tags = 장면. 그림체 설정은 스튜디오와 같은 studio_presets.json.
# key 는 Modal Secret 'miro-image-api' 의 MIRO_IMAGE_SECRET 과 같아야 한다(값은 ~/.miro/image-api-secret, 앱은 MIRO_IMAGE_SECRET env).
MINOR_BLOCK = 'child, loli, shota, young, teen, aged down, childlike, flat chest, petite child, underage, school uniform'
web_image = (modal.Image.debian_slim(python_version='3.11').pip_install('fastapi[standard]')
             .add_local_file(Path(__file__).parent / 'studio_presets.json', '/app/studio_presets.json'))


@app.function(image=web_image, secrets=[modal.Secret.from_name('miro-image-api')], timeout=600)
@modal.fastapi_endpoint(method='POST')
def image_api(body: dict):
    import base64, hmac, json, os
    from fastapi import HTTPException
    if not hmac.compare_digest(str(body.get('key', '')), os.environ['MIRO_IMAGE_SECRET']):
        raise HTTPException(status_code=401)
    style = json.load(open('/app/studio_presets.json', encoding='utf-8'))['styles'].get(body.get('style', ''))
    if not style:
        raise HTTPException(status_code=400, detail='unknown style')
    tags = str(body.get('tags', ''))[:1500]
    # 둘이 나오는 장면이면 상대 인물 + '둘이' 를 직접 지시(부정 프롬프트만으로는 셋째 인물이 끼었다, 11/2)
    who = style['partner'] + ', hetero, couple, duo, two people only' if body.get('couple') else 'solo'
    # 몸 묘사(복근·가슴 근육 등)는 언베일 장면에서만 — 일상 장면에 붙이면 옷을 벗기고 장면 묘사를 밀어낸다(11/2 확인).
    # 캐릭터 외형(look)은 주인공 바로 뒤·상대 인물 앞에 — 끝에 두면 약해지고 둘이 나오면 상대에게 섞였다(11/2: 남자가 금발로).
    # 주인공·외형·상대·장면 순(앞이 더 세게 걸린다), 몸 묘사는 맨 뒤. Compel 로 77토큰을 넘어도 잘리지 않는다.
    look = str(body.get('look', ''))[:400]
    prompt = ', '.join(x for x in [style['subject'], look, who, tags, style['body'] if body.get('unveil') else ''] if x)
    # 어려 보임 차단은 항상 맨 앞. 둘이 나오면 상대 성별이 바뀌지 않게(위프는 BL 데이터라 남자 둘로 끌린다), 일상이면 상의 탈의도 막는다.
    # 혼자 장면에 복제 인물이 끼지 않게, 혼자 언베일은 옷을 다 입히지 않게(옷 입은 레퍼런스 사진이 옷을 끌어온다, 11/2).
    solo_neg = '' if body.get('couple') else 'multiple girls, multiple boys, 2girls, 2boys, clone, duplicate, another person'
    if body.get('unveil') and not body.get('couple'):
        solo_neg += ', fully clothed, buttoned shirt, jacket, coat'
    neg = ', '.join(x for x in [MINOR_BLOCK, style['neg'], solo_neg, style.get('couple_neg', '') if body.get('couple') else '',
                                '' if body.get('unveil') else 'shirtless, topless, bare chest', str(body.get('extra_neg', ''))[:300]] if x)
    seed = int(body.get('seed') or 7)
    # 캐릭터 대표 사진(우리 Supabase 공개 버킷만 — 다른 주소는 받지 않는다). 둘이 나오면 상대 얼굴까지 닮지 않게 세기를 낮춘다.
    ref = None
    ref_url = str(body.get('ref_url', ''))
    if ref_url.startswith('https://rmuirlqxuxzpqoqeceej.supabase.co/storage/v1/object/public/'):
        import urllib.request
        try:
            ref = urllib.request.urlopen(ref_url, timeout=20).read()
        except Exception:
            ref = None
    # 일반: 그림체·옷 레퍼런스 0.6 + 얼굴 0.3 / 언베일: 그림체 0.3(옷이 덜 따라오게) + 얼굴 0.6. 둘이 나오면 상대가 닮지 않게 낮춘다.
    couple = 0.75 if body.get('couple') else 1.0
    ref_scale = (0.3 if body.get('unveil') else style.get('ref_scale', 0.6)) * couple
    face_scale = (0.6 if body.get('unveil') else 0.3) * couple
    png = Gen(ckpt=style['ckpt']).gen.remote(prompt, style['variant'], style['scale'], seed, neg, bool(body.get('unveil')), True,
                                            style['hr_scale'], style['hr_strength'], ref, ref_scale, face_scale)
    return {'png': base64.b64encode(png).decode(), 'prompt': prompt, 'neg': neg}   # 프롬프트는 확인용(앱은 png 만 쓴다)


@app.local_entrypoint()
def main(ckpt: str = 'siran_v1-step00002000.safetensors', scale: float = 1.0, out: str = 'output/lora-test',
         prompts: str = '', variant: str = '', seeds: str = '7', neg: str = '', unveil: bool = False, scales: str = '', hires: str = 'off',
         hr_scales: str = '', hr_strength: float = 0.4, inits: str = '', faces: str = '', face_scale: float = 0.5, ref_scale: float = 0.0,
         init_strengths: str = '0.65', ctrls: str = '', ctrl_scale: float = 0.6, ctrl_end: float = 0.6,
         ctrl_tops: str = '', redo_tops: str = '', redo_prompts: str = '', redo_strength: float = 0.85, redo_from: float = 0.0,
         line_seeds: str = ''):
    """--prompts 파일(한 줄에 프롬프트 하나)이 있으면 그 프롬프트만, --variant 하나로, --seeds 마다 뽑는다(캐릭터 사진용).
    비교용: --scales 0.6,0.8,1.0 (강도 여러 개), --hires off|on|both (업스케일 재생성)."""
    import os
    os.makedirs(out, exist_ok=True)
    lines = [l.strip() for l in open(prompts, encoding='utf-8') if l.strip()] if prompts else PROMPTS
    variants = [variant] if variant else list(TRIGGER)
    ws = [float(x) for x in scales.split(',')] if scales else [scale]
    hs = {'off': [False], 'on': [True], 'both': [False, True]}[hires]
    hrs = [float(x) for x in hr_scales.split(',')] if hr_scales else [0.0]   # 2단계 LoRA 강도(0 = 1단계와 같게)
    grid = bool(scales) or hires != 'off' or bool(hr_scales)
    # 11/4 --inits / --faces: 쉼표로 프롬프트 줄마다 밑그림·얼굴 레퍼런스 파일(줄 수와 같게, 빈 칸은 없음)
    per = lambda s: [(open(x, 'rb').read() if x else None) for x in s.split(',')] if s else [None] * len(lines)
    ini, fac, ctl = per(inits), per(faces), per(ctrls)
    sts = [float(x) for x in init_strengths.split(',')]
    tops = [float(x) for x in ctrl_tops.split(',')] if ctrl_tops else [0.0] * len(lines)
    rtops = [float(x) for x in redo_tops.split(',')] if redo_tops else [0.0] * len(lines)
    rps = [l.strip() for l in open(redo_prompts, encoding='utf-8') if l.strip()] if redo_prompts else [''] * len(lines)   # 2단계 프롬프트(줄마다)
    # 11/5 --line-seeds: 줄마다 시드 하나(같은 시드면 얼굴이 닮아서 인물마다 다르게)
    jobs = [(i + 1, p, v, int(s), w, h, r, st) for i, p in enumerate(lines) for v in variants
            for s in (line_seeds.split(',')[i:i + 1] if line_seeds else seeds.split(',')) for w in ws for h in hs
            for r in (hrs if h else [0.0]) for st in (sts if ini[i] else [0.0])]
    results = Gen(ckpt=ckpt).gen.starmap([(p, v, w, s, neg, unveil, h, r, hr_strength, fac[i - 1], ref_scale if fac[i - 1] else 0.0, face_scale if fac[i - 1] else 0.0,
                                           ini[i - 1], st, ctl[i - 1], ctrl_scale, ctrl_end, tops[i - 1], rtops[i - 1], rps[i - 1], redo_strength, redo_from) for i, p, v, s, w, h, r, st in jobs])
    for (i, _, v, s, w, h, r, st), data in zip(jobs, results):
        tag = (f'hr{r}' if h and r else ('hr' if h else 'base')) + (f'-i{st}' if st else '')
        path = (f'{out}/{i}-{v}-s{s}-w{w}-{tag}.png' if grid else f'{out}/{i}-{v}-s{s}.png') if prompts else f'{out}/{i}-{v}.png'
        open(path, 'wb').write(data)
        print('saved', path)
