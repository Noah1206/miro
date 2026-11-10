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
         .pip_install('demucs==4.0.1', 'soundfile', 'numpy<2')
         .add_local_python_source('voice_clean'))
OFFICIAL, USER = '/voices/_drama3/serving-voices', '/user-voices'


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
        from voice_clean import clean_reference
        raw, rate = sf.read(orig, dtype='float32', always_2d=True)
        v, ratio, rate = clean_reference(raw.mean(1), rate, 'cuda')
        sf.write(ref, v, rate, subtype='PCM_16')
        report.append({'id': vid[:8], 'background_db': round(float(ratio), 1), 'seconds': round(len(v) / rate, 1), 'folder': 'user' if folder.startswith(USER) else 'official'})
    voices.commit(); user_voices.commit()
    return report


@app.local_entrypoint()
def main(ids: str, restore: bool = False):
    for row in clean.remote([i for i in ids.split(',') if i], restore): print(row)
