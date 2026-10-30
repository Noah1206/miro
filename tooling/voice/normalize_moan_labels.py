"""labels.json 의 받아쓰기 초안 정리: 신음 음절만 있는 글자는 비우고, 실제 단어가 남은 클립만 목록으로 뽑는다.

사용: python3 normalize_moan_labels.py 데이터폴더   → labels.normalized.json, words_to_check.txt
"""
import json, re, sys
from pathlib import Path

INTERJECTION = re.compile(r'^[\s아오우으하흐앗읏응흣.,!?~…\-]*$')


def normalize(label):
    text = label['text'].strip()
    if not text or INTERJECTION.match(text):
        return {**label, 'text': '', 'text_source': 'cleared_interjection' if text else 'empty'}
    return {**label, 'text_source': 'needs_human_check'}


if __name__ == '__main__':
    root = Path(sys.argv[1])
    labels = [normalize(l) for l in json.loads((root / 'labels.json').read_text())]
    (root / 'labels.normalized.json').write_text(json.dumps(labels, ensure_ascii=False, indent=1))
    check = [l for l in labels if l['text_source'] == 'needs_human_check' and l['kind'] != 'discard']
    (root / 'words_to_check.txt').write_text(''.join(f"{l['clip_id']}\t{l['kind']}\t{l['text']}\n" for l in check))
    print('cleared', sum(l['text_source'] == 'cleared_interjection' for l in labels), 'check', len(check))
    for l in check: print(l['clip_id'], l['kind'], l['text'][:70])
