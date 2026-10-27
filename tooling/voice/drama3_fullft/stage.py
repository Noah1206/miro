"""Create a portable recording bundle with paths for a private GPU host."""
import argparse,hashlib,json,zipfile
from pathlib import Path
from .data import read_rows


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--gpu-root',required=True)
    ap.add_argument('--output',required=True);a=ap.parse_args();rows=read_rows(a.manifest);dest=Path(a.output)
    if dest.exists():raise FileExistsError(dest)
    rewritten=[]
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_STORED) as z:
        for row in rows:
            source=Path(row['audio_path']);sha=hashlib.sha256(source.read_bytes()).hexdigest()
            if sha!=row['sha256']:raise ValueError('Changed recording '+row['clip_id'])
            name='wavs/'+row['clip_id']+source.suffix.lower();z.write(source,name)
            rewritten.append({**row,'audio_path':str(Path(a.gpu_root)/name)})
        z.writestr('recordings.jsonl',''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rewritten))
    print(json.dumps({'bundle':str(dest),'clips':len(rows),'gpu_root':a.gpu_root,'bytes':dest.stat().st_size}))


if __name__=='__main__':main()
