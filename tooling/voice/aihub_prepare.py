"""
AI Hub 71349 화자 하나 → GPT-SoVITS 학습 데이터셋 zip(10/22). 받아쓰기 없이 라벨의 대본(voice_piece.tr)을 정답으로 쓴다.
  python3 aihub_prepare.py <라벨 폴더 TL_대화체_NNN> <원본 zip> <출력 폴더> <실험 이름>
감정별로 무감정(평온) 250·기쁨 150·슬픔 100·분노 100, 청취 평가(likert) 평균이 높고 2~10초인 문장부터. refs.json: 무감정(평온) 참조 1 + 보조 4, 감정별 참조.
"""
import json, glob, os, re, sys, zipfile

lbl, src_zip, out, exp = sys.argv[1:5]
QUOTA = {"무감정": 250, "기쁨": 150, "슬픔": 100, "분노": 100}
rows = []
for f in glob.glob(os.path.join(lbl, "*.json")):
    for d in json.load(open(f, encoding="utf-8-sig")):
        for s in d.get("sentences", []):
            vp = s.get("voice_piece", {}); emo = s.get("style", {}).get("emotion", "")
            text = (vp.get("tr") or s.get("origin_text") or "").strip(); dur = vp.get("duration") or 0
            votes = [v.get("likert_scale", 0) for v in s.get("votes", [])]
            if vp.get("filename") and 2 <= dur <= 10 and len(re.findall(r"[가-힣]", text)) >= 4:
                rows.append({"file": vp["filename"], "text": text, "emo": emo, "dur": dur, "score": sum(votes) / max(1, len(votes))})
picked = []
for emo, n in QUOTA.items():
    cand = sorted((r for r in rows if r["emo"] == emo), key=lambda r: (-r["score"], abs(r["dur"] - 5)))
    picked += cand[:n]
names = {r["file"] for r in picked}
wavs = os.path.join(out, "Miro_Dataset_Output"); os.makedirs(wavs, exist_ok=True)
with zipfile.ZipFile(src_zip) as z:
    for m in z.namelist():
        b = os.path.basename(m)
        if b in names:
            with z.open(m) as fi, open(os.path.join(wavs, b), "wb") as fo: fo.write(fi.read())
have = set(os.listdir(wavs)); picked = [r for r in picked if r["file"] in have]
with open(os.path.join(out, "raw_manhwa_voice.list"), "w", encoding="utf8") as fh:
    for r in picked: fh.write(f"{os.path.join(wavs, r['file'])}|{exp}|KO|{r['text']}\n")


def best(emo, k=1):
    c = sorted((r for r in picked if r["emo"] == emo and 3 <= r["dur"] <= 8 and len(re.findall(r"[가-힣]", r["text"])) >= 8), key=lambda r: (-r["score"], abs(r["dur"] - 5)))
    return c[:k]


neutral = best("무감정", 5)
refs = {"normal": {"file": neutral[0]["file"], "text": neutral[0]["text"]}, "aux": {"normal": [r["file"] for r in neutral[1:5]]},
        "emotion": {e: {"file": b[0]["file"], "text": b[0]["text"]} for e in QUOTA if (b := best(e))}}
json.dump(refs, open(os.path.join(out, "refs.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
# Modal 학습용 zip(경로는 파일 이름만 — modal_train.py --from-zip 이 컨테이너 경로로 다시 붙인다)
with zipfile.ZipFile(os.path.join(out, f"{exp}.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("raw_manhwa_voice.list", "".join(f"{r['file']}|{exp}|KO|{r['text']}\n" for r in picked))
    for r in picked: z.write(os.path.join(wavs, r["file"]), f"Miro_Dataset_Output/{r['file']}")
from collections import Counter
print(f"{exp}: {len(picked)}문장 {round(sum(r['dur'] for r in picked) / 60, 1)}분 {dict(Counter(r['emo'] for r in picked))} 참조='{refs['normal']['text'][:25]}'")
