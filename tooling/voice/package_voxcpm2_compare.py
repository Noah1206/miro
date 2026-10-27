"""Package the existing baseline and new VoxCPM2 takes into a local listening board."""

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


def encode_mp3(wav, destination):
    subprocess.run([
        "/opt/homebrew/bin/ffmpeg", "-v", "error", "-y", "-i", str(wav),
        "-codec:a", "libmp3lame", "-b:a", "160k", str(destination),
    ], check=True)


def main(folder):
    folder = Path(folder).resolve()
    manifest = json.loads((folder / "manifest.json").read_text())
    report = json.loads((folder / "generation_report.json").read_text())
    if len(report["items"]) != 12:
        raise ValueError("Expected all 12 first takes; refusing a partial comparison")
    listen = folder / "listening"
    listen.mkdir(exist_ok=True)
    variants = [("orig", "실제 녹음"), ("gsv", "기존 GPT-SoVITS"),
                ("vox_ultimate", "VoxCPM2 · 참조+대본"),
                ("vox_style", "VoxCPM2 · 감정 지시")]
    sounds, levels, cards = {}, [], []
    for row in manifest["items"]:
        sid = row["id"]
        baseline = folder / f"{sid}_gsv.wav"
        if hashlib.sha256(baseline.read_bytes()).hexdigest() != row["gsv_sha256"]:
            raise ValueError(f"Baseline changed: {sid}")
        controls = []
        for suffix, label in variants:
            source = folder / f"{sid}_{suffix}.wav"
            y, sr = sf.read(source, always_2d=True)
            y = y.mean(axis=1)
            if not len(y) or not np.isfinite(y).all() or np.max(np.abs(y)) < 1e-5:
                raise ValueError(f"Invalid or silent audio: {source}")
            probe = subprocess.run([
                "/opt/homebrew/bin/ffmpeg", "-hide_banner", "-i", str(source),
                "-af", "loudnorm=I=-23:TP=-1:LRA=50:print_format=json",
                "-f", "null", "-",
            ], capture_output=True, text=True, check=True)
            stats = json.loads(re.findall(r'\{[^{}]+"input_i"[^{}]+\}', probe.stderr)[-1])
            measured = float(stats["input_i"])
            gain = min(-23 - measured, -1 - 20 * np.log10(np.max(np.abs(y))))
            y = y * 10 ** (gain / 20)
            if sr != 48000:
                gcd = math.gcd(sr, 48000)
                y = resample_poly(y, 48000 // gcd, sr // gcd)
            wav = listen / f"{sid}_{suffix}.wav"
            sf.write(wav, y, 48000, subtype="PCM_16")
            mp3 = wav.with_suffix(".mp3")
            encode_mp3(wav, mp3)
            sounds[(sid, suffix)] = y
            levels.append({"file": source.name, "input_lufs": measured,
                           "constant_gain_db": round(float(gain), 3),
                           "duration_seconds": round(len(y) / 48000, 3)})
            uri = "data:audio/mpeg;base64," + base64.b64encode(mp3.read_bytes()).decode()
            controls.append(
                f'<div class="take"><span>{html.escape(label)}</span>'
                f'<audio controls preload="none" data-label="{html.escape(label)}" '
                f'src="{uri}"></audio></div>'
            )
        cards.append(
            f'<section><div class="eyebrow">{html.escape(row["emotion"])} · '
            f'{html.escape(sid)}</div><h2>{html.escape(row["text"])}</h2>'
            '<button class="compare">GPT-SoVITS → Vox 참조+대본 → Vox 감정 지시</button>'
            '<div class="playing" aria-live="polite"></div>' + "".join(controls) + '</section>'
        )
    # A fixed, preselected text from each emotion; no best-take selection.
    selected = ["D-H3-A-007-0787", "D-S3-A-007-0796", "D-A3-A-007-0840"]
    timeline, chunks, seconds = [], [], 0.0
    for sid in selected:
        row = next(r for r in manifest["items"] if r["id"] == sid)
        for suffix, label in variants[1:3]:
            y = sounds[(sid, suffix)]
            timeline.append({"start_seconds": round(seconds, 2), "id": sid,
                             "emotion": row["emotion"], "label": label, "text": row["text"]})
            chunks += [y, np.zeros(48000)]
            seconds += len(y) / 48000 + 1
    quick = folder / "quick_compare_gsv_then_voxcpm2.wav"
    sf.write(quick, np.concatenate(chunks), 48000, subtype="PCM_16")
    encode_mp3(quick, quick.with_suffix(".mp3"))
    style_chunks = []
    for sid in selected:
        for suffix in ("gsv", "vox_style"):
            style_chunks += [sounds[(sid, suffix)], np.zeros(48000)]
    style_quick = folder / "quick_compare_gsv_then_voxcpm2_style.wav"
    sf.write(style_quick, np.concatenate(style_chunks), 48000, subtype="PCM_16")
    encode_mp3(style_quick, style_quick.with_suffix(".mp3"))
    (folder / "listening_levels.json").write_text(json.dumps(levels, ensure_ascii=False, indent=2))
    (folder / "quick_compare_timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2))
    page = '''<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>미로 · 음성 비교</title>
<style>body{margin:0;background:#f7f5f0;color:#232521;font:16px/1.65 system-ui,sans-serif}
main{max-width:900px;margin:48px auto;padding:0 24px}h1{font-size:36px;letter-spacing:-1.4px}
h2{font-size:21px;font-weight:600;line-height:1.6}.note{color:#5b6157;max-width:760px}
section{background:#fff;border:1px solid #e2e5dd;border-radius:18px;margin:24px 0;padding:26px}
.eyebrow{font-size:13px;color:#6c7560}.take{display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center;margin:12px 0}
audio{width:100%;height:40px}button{border:0;background:#35462c;color:white;border-radius:9px;padding:12px 16px;cursor:pointer}
.playing{color:#526842;font-size:14px;min-height:24px;margin-top:8px}
@media(max-width:600px){main{padding:0 16px;margin:28px auto}.take{grid-template-columns:1fr;gap:2px}section{padding:20px}h1{font-size:29px}}
</style><main><p class="eyebrow">MIRO · 2026.10.22</p><h1>목소리와 감정, 같은 대사로 비교</h1>
<p class="note">007번 여성 성우 · AI Hub 71349 · 대사 6개. GPT-SoVITS는 기존 파일을 그대로 사용했고, VoxCPM2만 학습 없이 새로 생성했습니다. 각 모드는 고정 시드의 첫 결과입니다.</p>
<p class="note">듣기용 파일은 일정한 음량 배율만 적용했습니다. 속도·피치·쉼·문장 내부 다이내믹은 수정하지 않았습니다. 실제 녹음은 해당 대사의 원본이며, Vox의 참조는 같은 성우가 말한 다른 대사입니다.</p>
<p class="note">Vox 참조+대본: 감정별 참조 음성 및 정확한 대본. Vox 감정 지시: 같은 참조 음성 및 영어 감정 지시. 기존 GPT-SoVITS의 정확한 참조 설정은 확인되지 않아 완전히 동일한 조건의 모델 성능 순위로 해석할 수 없습니다. 남자 ASMR 적합성 및 운영 성능은 아직 미검증입니다.</p>
''' + "".join(cards) + '<p class="note">모델: openbmb/VoxCPM2 · 추가 학습 없음 · 잡음 제거 없음 · 시드 1234 · cfg 2.0 · 10 steps · ' + html.escape(report["gpu"]) + '''</p></main>
<script>
const audios=[...document.querySelectorAll('audio')];let queue=[],pos=0;
function stop(){queue=[];for(const a of audios){a.pause();a.currentTime=0}document.querySelectorAll('.playing').forEach(e=>e.textContent='')}
audios.forEach(a=>a.addEventListener('play',()=>{audios.forEach(b=>{if(a!==b)b.pause()})}));
document.querySelectorAll('section').forEach(s=>{s.querySelector('button').onclick=()=>{stop();queue=[...s.querySelectorAll('audio')].slice(1);pos=0;next()}});
function next(){const a=queue[pos++];if(!a)return;const p=a.closest('section').querySelector('.playing');p.textContent='재생 중: '+a.dataset.label;a.currentTime=0;a.onended=()=>{p.textContent='';setTimeout(next,700)};a.play().catch(()=>{p.textContent='재생 버튼을 눌러 주세요.'})}
</script></html>'''
    (folder / "compare.html").write_text(page, encoding="utf8")
    print(json.dumps({"comparison": str(folder / "compare.html"),
                      "quick_seconds": round(seconds, 2), "takes": len(levels)}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
