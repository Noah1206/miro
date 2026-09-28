"""
미로 공식 보이스 — 로컬 Chatterbox 엔진. tooling/voice/import.ts 가 부른다.

Resemble AI Chatterbox Multilingual (코드·가중치 MIT, chatterbox-tts==0.1.7, 한국어 'ko').
녹음과 목소리 파일은 이 PC 밖으로 나가지 않는다. 가중치는 고정한 Hugging Face 리비전에서만,
fetch 로만 받는다 — prepare·speak 는 이미 받은 파일만 쓴다.

  fetch                                                   가중치 받기(약 3.2GB, 한 번)
  prepare --reference ref.wav --out voice.pt              참조 녹음으로 목소리 조건(Conditionals)을 한 번 만든다
  speak --voice voice.pt --lines lines.json --out-dir D   저장한 목소리로 대사를 읽는다(녹음은 다시 읽지 않는다)

결과는 stdout 마지막 줄의 JSON 한 줄.
"""
import argparse
import json
import time
from importlib.metadata import version

REPO_ID = 'ResembleAI/chatterbox'
# 2026-06-10 main (license: mit). 바꾸면 새로 받아야 하고, 이미 승인한 목소리 파일과 모델이 어긋난다.
REVISION = '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18'
# chatterbox-tts 0.1.7 의 ChatterboxMultilingualTTS.from_pretrained 가 받는 파일과 같다(t3_mtl23ls_v2).
FILES = ['ve.pt', 't3_mtl23ls_v2.safetensors', 's3gen.pt', 'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json']
LANGUAGE = 'ko'


def checkpoint(download: bool) -> str:
    from huggingface_hub import snapshot_download
    return snapshot_download(repo_id=REPO_ID, revision=REVISION, allow_patterns=FILES, local_files_only=not download)


def ms(start: float, end: float | None = None) -> int:
    return round(((end or time.perf_counter()) - start) * 1000)


def emit(result: dict) -> None:
    print(json.dumps(result, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('fetch')
    prepare = sub.add_parser('prepare')
    prepare.add_argument('--reference', required=True)
    prepare.add_argument('--out', required=True)
    prepare.add_argument('--device', default='auto')
    speak = sub.add_parser('speak')
    speak.add_argument('--voice', required=True)
    speak.add_argument('--lines', required=True)
    speak.add_argument('--out-dir', required=True)
    speak.add_argument('--device', default='auto')
    args = parser.parse_args()

    started = time.perf_counter()
    info = {'engine': 'chatterbox-tts', 'version': version('chatterbox-tts'), 'model': 't3_mtl23ls_v2', 'revision': REVISION}
    if args.cmd == 'fetch':
        emit({**info, 'path': checkpoint(download=True), 'ms': ms(started)})
        return

    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals
    device = args.device if args.device != 'auto' else ('mps' if torch.backends.mps.is_available() else 'cpu')
    model = ChatterboxMultilingualTTS.from_local(checkpoint(download=False), device)
    loaded = time.perf_counter()

    if args.cmd == 'prepare':
        model.prepare_conditionals(args.reference)  # 문서 기본값 exaggeration 0.5
        model.conds.save(args.out)
        emit({**info, 'device': device, 'loadMs': ms(started, loaded), 'ms': ms(loaded)})
        return

    import soundfile
    model.conds = Conditionals.load(args.voice, map_location='cpu').to(device)
    items = []
    with open(args.lines, encoding='utf-8') as f:
        lines = json.load(f)
    for n, line in enumerate(lines):
        t0 = time.perf_counter()
        # 문서 기본값(exaggeration·cfg_weight 0.5, temperature 0.8) 그대로. 감정은 문장으로만 싣는다.
        wav = model.generate(line['text'], language_id=LANGUAGE)
        out = f"{args.out_dir}/{n + 1}-{line['kind']}.wav"
        soundfile.write(out, wav.squeeze(0).numpy(), model.sr)
        items.append({'kind': line['kind'], 'file': out, 'ms': ms(t0)})
    emit({**info, 'device': device, 'loadMs': ms(started, loaded), 'sampleRate': model.sr, 'items': items})


if __name__ == '__main__':
    main()
