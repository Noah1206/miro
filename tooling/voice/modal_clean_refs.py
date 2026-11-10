"""
11/11 목소리 견본 배경 걷어내기 — 사용자: "목소리 말고 배경 소리가 들린다". 합성 모델(Drama 3)은 견본 녹음의 배경음악·잡음까지 흉내 낸다.
견본마다 Demucs(htdemucs)로 목소리만 남긴다. 원본은 같은 폴더에 ref.orig.wav 로 남기고(이미 있으면 그 원본에서 다시 분리), ref.txt 는 그대로.
실행: ~/.miro/voice-venv/bin/modal run modal_clean_refs.py --ids <provider_voice_id,...>   (되돌리기: --restore)
배포된 합성 서버는 켜질 때 견본을 읽으므로, 끝나면 서버 컨테이너를 내려야 새 견본을 쓴다.
"""
import modal

app = modal.App('miro-clean-voice-refs')
voices = modal.Volume.from_name('miro-voices')
user_voices = modal.Volume.from_name('miro-user-voices')
image = (modal.Image.debian_slim(python_version='3.12').apt_install('ffmpeg')
         .pip_install('torch==2.8.0', 'torchaudio==2.8.0', index_url='https://download.pytorch.org/whl/cu128')
         .pip_install('demucs==4.0.1', 'soundfile', 'numpy<2'))
OFFICIAL, USER = '/voices/_drama3/serving-voices', '/user-voices'


def squeeze_silence(v, rate, keep=0.25, edge=0.1, floor_db=-40):
    import numpy as np
    win = int(rate * 0.02); n = len(v) // win
    if n < 2: return v
    energy = np.sqrt(np.mean(v[: n * win].reshape(n, win) ** 2, axis=1))
    loud = energy > (energy.max() * 10 ** (floor_db / 20))
    if not loud.any(): return v
    first, last = int(np.argmax(loud)), int(n - 1 - np.argmax(loud[::-1]))
    parts, run = [], 0
    for i in range(max(0, first - int(edge / 0.02)), min(n, last + 1 + int(edge / 0.02))):
        run = 0 if loud[i] else run + 1
        if run * 0.02 <= keep: parts.append(v[i * win : (i + 1) * win])
    return np.concatenate(parts)


@app.function(image=image, gpu='T4', timeout=1800, volumes={'/voices': voices, USER: user_voices})
def clean(ids: list[str], restore: bool = False):
    import os, shutil, subprocess, numpy as np, soundfile as sf
    report = []
    for vid in ids:
        folder = next((f'{root}/{vid}' for root in (OFFICIAL, USER) if os.path.isfile(f'{root}/{vid}/ref.wav')), None)
        if not folder: report.append({'id': vid[:8], 'error': 'not found'}); continue
        ref, orig = f'{folder}/ref.wav', f'{folder}/ref.orig.wav'
        if restore:
            if os.path.isfile(orig): shutil.copyfile(orig, ref)
            report.append({'id': vid[:8], 'restored': os.path.isfile(orig)}); continue
        if not os.path.isfile(orig): shutil.copyfile(ref, orig)
        import torch, torchaudio
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        model = get_model('htdemucs').eval().cuda()
        raw, rate = sf.read(orig, dtype='float32', always_2d=True)
        wav = torch.from_numpy(raw.T.copy())
        if wav.shape[0] == 1: wav = wav.repeat(2, 1)
        if rate != model.samplerate: wav = torchaudio.functional.resample(wav, rate, model.samplerate)
        ref_mean, ref_std = wav.mean(), wav.std() + 1e-8
        with torch.no_grad(): sources = apply_model(model, ((wav - ref_mean) / ref_std)[None].cuda(), device='cuda')[0].cpu() * ref_std + ref_mean
        v = sources[model.sources.index('vocals')].mean(0).numpy()
        b = (sources.sum(0) - sources[model.sources.index('vocals')]).mean(0).numpy()
        rate = model.samplerate
        # 배경이 목소리 대비 얼마나 컸나(dB). -30 dB 아래면 거의 없던 것.
        ratio = 20 * np.log10((np.sqrt(np.mean(b ** 2)) + 1e-9) / (np.sqrt(np.mean(v ** 2)) + 1e-9))
        # 배경을 걷으면 음악이 있던 자리가 긴 침묵으로 남는다 — 모델이 그 침묵까지 흉내 내 말 사이가 길어지고 끝에서 멈추지 않았다(11/11 실측 96초).
        # 0.25초 넘는 침묵은 0.25초로 줄이고 앞뒤는 0.1초만 남긴다(글자는 그대로라 ref.txt 와 맞는다).
        v = squeeze_silence(v, rate)
        peak = np.abs(v).max()
        sf.write(ref, v / peak * 0.95 if peak > 0 else v, rate, subtype='PCM_16')
        report.append({'id': vid[:8], 'background_db': round(float(ratio), 1), 'seconds': round(len(v) / rate, 1), 'folder': 'user' if folder.startswith(USER) else 'official'})
    voices.commit(); user_voices.commit()
    return report


@app.local_entrypoint()
def main(ids: str, restore: bool = False):
    for row in clean.remote([i for i in ids.split(',') if i], restore): print(row)
