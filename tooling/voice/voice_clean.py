"""
11/11 목소리 견본 정리 — 공식 견본 일괄 정리(modal_clean_refs.py)와 회원 녹음 받기(modal_drama3_serve.py Voices)가 같이 쓴다.
합성 모델(Drama 3)은 견본의 배경음악·잡음과 침묵까지 흉내 낸다 — 목소리만 남기고(Demucs htdemucs), 걷어 낸 자리의 긴 침묵은 줄인다.
"""


def separate_vocals(wave, rate, device='cpu'):
    """모노 float 배열 → (목소리, 배경 대비 dB, 샘플레이트). 배경 대비가 -30 dB 아래면 원래 거의 깨끗했던 것."""
    import numpy as np, torch, torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    model = get_model('htdemucs').eval().to(device)
    wav = torch.from_numpy(np.asarray(wave, dtype='float32'))[None].repeat(2, 1)
    if rate != model.samplerate: wav = torchaudio.functional.resample(wav, rate, model.samplerate)
    mean, std = wav.mean(), wav.std() + 1e-8
    with torch.no_grad(): sources = apply_model(model, ((wav - mean) / std)[None].to(device), device=device)[0].cpu() * std
    k = model.sources.index('vocals')
    vocals = sources[k].mean(0).numpy()
    rest = (sources.sum(0) - sources[k]).mean(0).numpy()
    ratio = 20 * np.log10((np.sqrt(np.mean(rest ** 2)) + 1e-9) / (np.sqrt(np.mean(vocals ** 2)) + 1e-9))
    return vocals, float(ratio), model.samplerate


def squeeze_silence(v, rate, keep=0.25, edge=0.1, floor_db=-40):
    """0.25초 넘는 침묵은 0.25초로, 앞뒤는 0.1초만 — 그대로 두면 모델이 긴 침묵을 흉내 내 말이 늘어지고 끝에서 멈추지 않았다(11/11 실측 96초)."""
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


def clean_reference(wave, rate, device='cpu'):
    """견본 하나 정리: 목소리만 → 침묵 줄이기 → 최대 0.95 로 맞춤. (정리된 소리, 배경 대비 dB, 샘플레이트)."""
    import numpy as np
    vocals, ratio, rate = separate_vocals(wave, rate, device)
    v = squeeze_silence(vocals, rate)
    peak = float(np.abs(v).max()) if len(v) else 0.0
    return (v / peak * 0.95 if peak > 0 else v), ratio, rate
