"""Build a self-contained listening board. Keep unsupported F5 and un-cloned Sohee separate."""

import base64
import hashlib
import html
import json
import math
from pathlib import Path
import re
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from package_voxcpm2_compare import encode_mp3


def main(folder):
    p = Path(folder).resolve()
    m = json.loads((p / "manifest.json").read_text())
    listen = p / "listening"
    listen.mkdir(exist_ok=True)
    sounds, levels, assets = {}, [], {}
    variants = [
        ("orig", "실제 녹음"),
        ("cb_default", "Chatterbox V3 · 기본"),
        ("cb_expressive", "Chatterbox V3 · 표현 강화"),
        ("qwen_clone", "Qwen 1.7B · 새 클로닝"),
        ("gsv", "기존 GPT-SoVITS"),
        ("vox_ultimate", "기존 VoxCPM2 · 참조+대본"),
        ("qwen_previous", "이전 Qwen 클로닝"),
        ("qwen_sohee", "Qwen Sohee · 감정 지시 / 클로닝 아님"),
        ("f5_diagnostic", "F5-TTS · 한국어 미지원 참고"),
    ]
    for row in m["items"]:
        sid = row["id"]
        if hashlib.sha256((p / f"{sid}_gsv.wav").read_bytes()).hexdigest() != row["gsv_sha256"]:
            raise ValueError("Existing GPT-SoVITS sample changed")
        for suffix, label in variants:
            source = p / f"{sid}_{suffix}.wav"
            if not source.exists():
                continue
            y, sr = sf.read(source, always_2d=True)
            y = y.mean(axis=1)
            peak = np.max(np.abs(y))
            if not len(y) or not np.isfinite(y).all() or peak < 1e-5:
                levels.append({"file": source.name, "error": "Invalid or silent waveform"})
                continue
            probe = subprocess.run([
                "/opt/homebrew/bin/ffmpeg", "-hide_banner", "-i", str(source),
                "-af", "loudnorm=I=-23:TP=-1:LRA=50:print_format=json", "-f", "null", "-",
            ], capture_output=True, text=True, check=True)
            stats = json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}', probe.stderr)[-1])
            measured = float(stats["input_i"])
            if not math.isfinite(measured):
                levels.append({"file": source.name, "error": "Cannot measure speech loudness"})
                continue
            gain = min(-23 - measured, -1 - 20 * np.log10(peak))
            y *= 10 ** (gain / 20)
            if sr != 48000:
                gcd = math.gcd(sr, 48000)
                y = resample_poly(y, 48000 // gcd, sr // gcd)
            wav = listen / f"{sid}_{suffix}.wav"
            sf.write(wav, y, 48000, subtype="PCM_16")
            mp3 = wav.with_suffix(".mp3")
            encode_mp3(wav, mp3)
            sounds[(sid, suffix)] = y
            uri = "data:audio/mpeg;base64," + base64.b64encode(mp3.read_bytes()).decode()
            assets[(sid, suffix)] = (
                '<div class="take"><span>' + html.escape(label) + '</span>'
                '<audio controls preload="none" data-label="' + html.escape(label) + '" src="' + uri + '"></audio></div>'
            )
            levels.append({"file": source.name, "duration_seconds": round(len(y) / 48000, 3),
                           "input_lufs": measured, "constant_gain_db": round(float(gain), 3)})

    def take(sid, suffix):
        return assets.get((sid, suffix), '<p class="missing">생성 결과 없음</p>')

    cards, controls, diagnostics = [], [], []
    for row in m["items"]:
        sid = row["id"]
        title = '<p class="eyebrow">' + html.escape(row["emotion"]) + '</p><h2>' + html.escape(row["text"]) + '</h2>'
        cards.append('<section>' + title +
                     '<button class="compare">Chatterbox 기본 → 표현 강화 → Qwen 클로닝</button><p class="playing" aria-live="polite"></p>' +
                     '<div class="main-takes">' + ''.join(take(sid, k) for k in ("cb_default", "cb_expressive", "qwen_clone")) + '</div>' +
                     '<details><summary>실제 녹음과 이전 결과도 듣기</summary>' +
                     ''.join(take(sid, k) for k in ("orig", "gsv", "vox_ultimate", "qwen_previous")) + '</details></section>')
        if (sid, "qwen_sohee") in assets:
            controls.append('<section>' + title + take(sid, "qwen_sohee") + '</section>')
        if (sid, "f5_diagnostic") in assets:
            diagnostics.append('<section>' + title + take(sid, "f5_diagnostic") + '</section>')

    selected = ["D-H3-A-007-0787", "D-S3-A-007-0796", "D-A3-A-007-0840"]
    sequences = {
        "quick_chatterbox_then_qwen": [(sid, k) for sid in selected for k in ("cb_default", "cb_expressive", "qwen_clone")],
        "quick_qwen_sohee_acting_not_clone": [(sid, "qwen_sohee") for sid in selected],
        "f5_korean_unsupported_diagnostic": [(sid, "f5_diagnostic") for sid in (selected[0], selected[-1])],
    }
    timelines = {}
    for name, keys in sequences.items():
        if not all(key in sounds for key in keys):
            continue
        chunks, timeline, seconds = [], [], 0.0
        for sid, suffix in keys:
            y = sounds[(sid, suffix)]
            timeline.append({"start_seconds": round(seconds, 2), "id": sid, "mode": suffix})
            chunks += [y, np.zeros(48000)]
            seconds += len(y) / 48000 + 1
        wav = p / f"{name}.wav"
        sf.write(wav, np.concatenate(chunks), 48000, subtype="PCM_16")
        encode_mp3(wav, wav.with_suffix(".mp3"))
        timelines[name] = {"duration_seconds": round(seconds, 2), "tracks": timeline}

    page = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>미로 · Chatterbox / Qwen / F5 비교</title><style>
body{margin:0;background:#f7f5f0;color:#232521;font:16px/1.65 system-ui,sans-serif}main{max-width:960px;margin:48px auto;padding:0 24px}
h1{font-size:34px;letter-spacing:-1.2px}h2{font-size:20px;line-height:1.6}section{background:#fff;border:1px solid #e2e5dd;border-radius:16px;margin:20px 0;padding:24px}
.note{color:#5b6157}.eyebrow{font-size:13px;color:#6c7560}.take{display:grid;grid-template-columns:240px 1fr;gap:12px;align-items:center;margin:12px 0}
audio{width:100%;height:40px}button{border:0;background:#35462c;color:#fff;border-radius:9px;padding:12px 16px;cursor:pointer}.playing{font-size:14px;color:#526842;min-height:22px}
details{margin-top:22px}summary{cursor:pointer}.reference{border-left:4px solid #bc8230;padding:12px 18px;background:#fff6e7}.missing{color:#936424}
@media(max-width:650px){main{padding:0 16px;margin:28px auto}h1{font-size:28px}.take{grid-template-columns:1fr;gap:2px}section{padding:18px}}
</style><main><p class="eyebrow">MIRO · 2026.10.22 · 추가 학습 없음</p>
<h1>세 모델, 같은 대사로 확인</h1>
<p class="note">007번 여성 성우의 기존 참조 녹음과 대사 6개를 사용했습니다. Chatterbox V3와 Qwen Base는 같은 감정별 참조를 사용합니다. 각 조건은 고정 시드로 생성했으며, GPT-SoVITS와 VoxCPM2는 이전 파일을 재사용합니다. 두 샘플은 저장 시 음량 초과로 잘리지 않도록 같은 시드·설정으로 다시 생성해 float WAV로 보존했습니다.</p>
<p class="note">Chatterbox 기본: 표현 강도 0.5 · 표현 강화: 0.7. 한국어는 Multilingual V3로 생성했고, 영어 Turbo 전용 웃음·기침 태그를 섞지 않았습니다. 음량 배율만 맞췄으며 피치·속도·쉼은 수정하지 않았습니다.</p>
''' + ''.join(cards) + '''<h1>Qwen 감정 연기 참고</h1><p class="reference">Sohee는 기본 제공 한국어 여성 성우입니다. 007번을 복제한 목소리가 아닙니다. 모델이 감정 지시를 따르는지 확인하는 용도입니다.</p>''' + ''.join(controls) + '''<h1>F5-TTS 한국어 지원 범위 확인</h1><p class="reference">공식 F5TTS_v1_Base는 중국어·영어 가중치입니다. 아래는 한국어 미지원 영향을 확인하는 2문장 진단이며, 한국어 모델 간 품질 순위로 해석할 수 없습니다. 자동 받아쓰기에서는 두 문장 모두 원래 대사와 크게 달랐습니다. 가중치는 CC-BY-NC이며 운영에 적용하지 않았습니다.</p>''' + ''.join(diagnostics) + '''<p class="note">Whisper 자동 받아쓰기로 발음·문장 누락을 확인했습니다. 자동 받아쓰기 정확도는 감정·자연스러움 점수가 아닙니다. 남자 ASMR 적합성은 이 여성 성우 비교만으로 판단할 수 없습니다.</p></main><script>
const audios=[...document.querySelectorAll('audio')];let queue=[],pos=0;
function stop(){queue=[];for(const a of audios){a.pause();a.currentTime=0}document.querySelectorAll('.playing').forEach(e=>e.textContent='')}
audios.forEach(a=>a.addEventListener('play',()=>audios.forEach(b=>{if(a!==b)b.pause()})));
document.querySelectorAll('.compare').forEach(b=>b.onclick=()=>{stop();queue=[...b.closest('section').querySelectorAll('.main-takes audio')];pos=0;next()});
function next(){const a=queue[pos++];if(!a)return;const p=a.closest('section').querySelector('.playing');p.textContent='재생 중: '+a.dataset.label;a.currentTime=0;a.onended=()=>{p.textContent='';setTimeout(next,700)};a.play().catch(()=>p.textContent='재생 버튼을 눌러 주세요.')}
</script></html>'''
    (p / "compare.html").write_text(page, encoding="utf8")
    (p / "listening_levels.json").write_text(json.dumps(levels, ensure_ascii=False, indent=2))
    (p / "quick_timelines.json").write_text(json.dumps(timelines, ensure_ascii=False, indent=2))
    print(json.dumps({"audio_count": len(assets), "quick": timelines}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
