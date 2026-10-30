"""CUDA 그래프 A/B(10/31, 사용자 승인 상한 $3) — 서빙(modal_drama3_serve.py)과 같은 모델·목소리·샘플링으로
같은 문장을 느린 경로(FISH_DRAMA3_CUDA_GRAPH=0)와 CUDA 그래프로 같은 시드에서 만들어 시간·생성 결과를 비교한다.
운영 앱과 분리된 앱이다. 결과: output/voice-upload/graph-ab/{report.json, *_eager.wav, *_graph.wav}

  modal run tooling/voice/modal_drama3_graph_ab.py
"""
import json, pathlib
import modal
from modal_drama3_compare import image as base_image, voices

WEIGHTS = '/voices/_drama3/miro-moan-20261029-v2/native-moan-v2'
VOICES = '/voices/_drama3/serving-voices'
SAMPLING = 'fish-space-untruncated-v1'
TEXTS = ['오늘 하루는 어땠어? 나는 네 생각 많이 했어.',
         '[moaning softly] 하아… 거기, 조금만 더 천천히.',
         '[sad, gentle, slow speech] 미안해. 내가 너무 늦게 알았어.']
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'}).add_local_python_source('drama3_fullft', 'modal_drama3_compare'))
app = modal.App('miro-drama3-graph-ab')


@app.function(image=image, gpu='H200', cpu=(8, 8), memory=(131072, 196608), timeout=1200, volumes={'/voices': voices})
def ab():
    import io, os, time, numpy as np, soundfile as sf, torch
    from pathlib import Path
    from fish_speech.models.text2semantic.inference import init_model, load_codec_model, encode_audio, decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3, Drama3DecodeGraphs
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.sampling_profiles import sampling_profile
    t0 = time.time()
    weights = Path(WEIGHTS)
    with native_checkpoint_routing(weights): model, _ = init_model(weights, 'cuda:0', torch.bfloat16, compile=False)
    model.eval()
    codec = load_codec_model(weights / 'codec.pth', str(model.device), torch.bfloat16).eval()
    load_s = time.time() - t0
    names = ['asmr01'] + [n for n in sorted(os.listdir(VOICES)) if n != 'asmr01'][:1]
    refs = {}
    for n in names:
        with torch.inference_mode(): refs[n] = (open(f'{VOICES}/{n}/ref.txt', encoding='utf-8').read().strip(), encode_audio(f'{VOICES}/{n}/ref.wav', codec, str(model.device)).cpu().long())
    jobs = [(n, i, t) for n in names for i, t in enumerate(TEXTS)]

    def run(voice, text, seed):
        ref_text, codes = refs[voice]
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + text, model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
            torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
            torch.cuda.synchronize(); s = time.time()
            frames, _ = generate_drama3(model, prompt, max_new_tokens=min(1536, max(384, len(text) * 24)), **sampling_profile(SAMPLING))
            torch.cuda.synchronize(); gen = time.time() - s
            wave = decode_to_audio(frames[:, 1:].T.contiguous().to(model.device), codec).float().cpu().numpy().squeeze()
        buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), codec.sample_rate, format='WAV', subtype='PCM_16')
        return frames.cpu(), gen, len(wave) / codec.sample_rate, buf.getvalue()

    out, files = [], {}
    os.environ['FISH_DRAMA3_CUDA_GRAPH'] = '0'
    run(names[0], TEXTS[0], 1)   # 첫 실행의 메모리 준비가 느린 경로 시간에 끼지 않게 한 번 버린다
    eager = {(n, i): run(n, t, 1000 + i) for n, i, t in jobs}
    os.environ['FISH_DRAMA3_CUDA_GRAPH'] = '1'
    s = time.time()
    with torch.inference_mode(): Drama3DecodeGraphs.for_model(model, 1)   # generate_drama3 와 같이 추론 모드에서 잡아야 한다
    capture_s = time.time() - s
    graph = {(n, i): run(n, t, 1000 + i) for n, i, t in jobs}
    for n, i, t in jobs:
        (fe, ge, ae, we), (fg, gg, ag, wg) = eager[n, i], graph[n, i]
        same = fe.shape == fg.shape and bool(torch.equal(fe, fg))
        out.append({'voice': n, 'text': t, 'identical_frames': same, 'eager_frames': fe.shape[0], 'graph_frames': fg.shape[0],
                    'eager_gen_s': round(ge, 2), 'graph_gen_s': round(gg, 2), 'eager_audio_s': round(ae, 2), 'graph_audio_s': round(ag, 2),
                    'eager_rtf': round(ge / ae, 3), 'graph_rtf': round(gg / ag, 3)})
        files[f'{n}_{i}_eager.wav'], files[f'{n}_{i}_graph.wav'] = we, wg
    return {'load_s': round(load_s, 1), 'graph_capture_s': round(capture_s, 1), 'results': out}, files


@app.local_entrypoint()
def main():
    report, files = ab.remote()
    d = pathlib.Path(__file__).resolve().parents[2] / 'output/voice-upload/graph-ab'
    d.mkdir(parents=True, exist_ok=True)
    for k, v in files.items(): (d / k).write_bytes(v)
    (d / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps(report, ensure_ascii=False, indent=1))
