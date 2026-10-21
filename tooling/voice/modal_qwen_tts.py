"""
Qwen3-TTS 제로샷 비교(10/22) — 참조 한 조각 + 문장들 → wav. 억양 비교용(GPT-SoVITS 는 한국어 문장 의미 정보가 0 이라 억양이 평평하다).
  modal run modal_qwen_tts.py --ref /_qwen/ref_007.wav --ref-text "..." --texts "문장1|문장2" --out /_qwen/out_007
"""
import modal

from modal_eval import qwen_image, voices

image = qwen_image.add_local_python_source("modal_eval")  # 컨테이너 안에서도 modal_eval 을 import 한다
app = modal.App("miro-qwen-tts")


@app.function(image=image, gpu="L4", volumes={"/voices": voices}, timeout=1200)
def speak(ref: str, ref_text: str, texts: list, out: str, size: str = "1.7B") -> list:
    import os, torch, soundfile as sf
    from qwen_tts import Qwen3TTSModel
    voices.reload()
    m = Qwen3TTSModel.from_pretrained(f"Qwen/Qwen3-TTS-12Hz-{size}-Base", device_map="cuda:0", dtype=torch.bfloat16)
    prompt = m.create_voice_clone_prompt(ref_audio=f"/voices{ref}", ref_text=ref_text)
    os.makedirs(f"/voices{out}", exist_ok=True); paths = []
    for i, t in enumerate(texts):
        wavs, sr = m.generate_voice_clone(text=t, language="Korean", voice_clone_prompt=prompt)
        p = f"{out}/{i:02d}.wav"; sf.write(f"/voices{p}", wavs[0], sr); paths.append(p)
    voices.commit()
    return paths


@app.local_entrypoint()
def main(ref: str, ref_text: str, texts: str, out: str, size: str = "1.7B"):
    print(speak.remote(ref, ref_text, texts.split("|"), out, size))
