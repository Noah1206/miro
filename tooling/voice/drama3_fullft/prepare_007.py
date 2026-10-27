"""Prepare real007 metadata without changing audio or pretending a second speaker exists."""
import argparse,collections,hashlib,json,random
from pathlib import Path
import soundfile as sf
from .data import audit


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--prior-manifest',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
    old=json.loads(Path(a.prior_manifest).read_text());data=Path(old['dataset']);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    rows=old['train']+old['excluded'];known_refs={'D-NX-A-007-0501.wav','D-H3-A-007-0755.wav','D-S3-A-007-0660.wav','D-A3-A-007-0317.wav'}
    test_ids={r['id']+'.wav' for r in old['evaluation'] if r['id'].startswith('D-')}
    eligible=sorted([x['file'] for x in rows if x['file'] not in known_refs|test_ids]);random.Random(1234).shuffle(eligible)
    validation=set(eligible[:max(1,round(len(eligible)*.1))]);labels={'NX':'neutral','H3':'happy','S3':'sad','A3':'angry'};result=[]
    for row in rows:
        source=data/row['file'];sha=hashlib.sha256(source.read_bytes()).hexdigest();assert sha==row['sha256']
        info=sf.info(source);emotion=labels[row['file'].split('-')[1]]
        split='reference' if row['file'] in known_refs else 'test' if row['file'] in test_ids else 'validation' if row['file'] in validation else 'train'
        result.append({'clip_id':Path(row['file']).stem,'speaker_id':'aihub007','audio_path':str(source),'text':row['text'],
            'recording_id':Path(row['file']).stem,'session_id':'AIHub71349-007','split':split,'source_kind':'human_recording',
            'sha256':sha,'sample_rate':info.samplerate,'duration_seconds':info.duration,'emotion':emotion,
            'delivery_instruction':'' if emotion=='neutral' else emotion,'annotation_source':'AIHub filename emotion label; intensity/acting not manually revalidated',
            'voice_rights':'User confirmed source rights in current task','language':'ko'})
    file=out/'recordings.jsonl';file.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in result))
    report=audit(file);report['prepared_not_encoded_or_trained']=True;report['new_speaker_recordings_pending']=True
    (out/'data_readiness.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,indent=2))


if __name__=='__main__':main()
