"""Publish every extended-comparison take; raw synthesis files remain unchanged."""
import argparse,hashlib,html,json,re,subprocess
from pathlib import Path
import librosa,numpy as np,soundfile as sf


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');ap.add_argument('--features-only',action='store_true');args=ap.parse_args();p=Path(args.folder)
    m=json.loads((p/'manifest.json').read_text());reports={e:json.loads((p/e/'report.json').read_text()) for e in ['qwen','drama']}
    listen=p/'listening';listen.mkdir(exist_ok=True);waves={};peak=0;phonation=[]
    cached={x['key']:x for x in json.loads((p/'phonation.json').read_text())} if (p/'phonation.json').exists() else {}
    for e,report in reports.items():
        assert report['status']=='complete'
        for item in report['items']:
            key=e+'/'+item['file'];raw=p/key;assert hashlib.sha256(raw.read_bytes()).hexdigest()==item['sha256']
            y,sr=sf.read(raw);assert y.ndim==1 and np.isfinite(y).all()
            waves[key]=librosa.resample(y,orig_sr=sr,target_sr=48000);peak=max(peak,float(np.abs(waves[key]).max()))
            if key in cached and cached[key].get('source_sha256')==item['sha256']:
                phonation.append(cached[key]);continue
            a=librosa.resample(y.astype(np.float32),orig_sr=sr,target_sr=16000)
            hop=256;f0,voiced,prob=librosa.pyin(a,fmin=60,fmax=600,sr=16000,frame_length=2048,hop_length=hop)
            rms=librosa.feature.rms(y=a,frame_length=2048,hop_length=hop)[0];db=20*np.log10(rms+1e-10);active=db>np.percentile(db,95)-30
            flat=librosa.feature.spectral_flatness(y=a,n_fft=2048,hop_length=hop)[0]
            n=min(len(active),len(voiced),len(flat));active=active[:n];v=voiced[:n]&active
            phonation.append({'key':key,'source_sha256':item['sha256'],'pitch_track_voiced_fraction_in_active_frames':float(voiced[:n][active].mean()),'pitch_median_hz_when_tracked':float(np.nanmedian(f0[:n][v])) if v.any() else None,'median_spectral_flatness_active':float(np.median(flat[:n][active])),'notes':'Acoustic proxy only: breath, fricatives and pitch-tracker errors can mimic whisper; low volume alone is not a whisper.'})
            print('PHONATION',key,phonation[-1]['pitch_track_voiced_fraction_in_active_frames'],flush=True)
    (p/'phonation.json').write_text(json.dumps(phonation,ensure_ascii=False,indent=2))
    if args.features_only:return
    audit=json.loads((p/'audit/audit.json').read_text());byfile={(r['engine'],r['file']):r for r in audit['items']}
    base=waves['qwen/qwen_clone_s1234.wav'];gain=min(10**(-23/20)/max(1e-9,float(np.sqrt(np.mean(base**2)))),10**(-1/20)/max(peak,1e-9))
    def name(key):return key.replace('/','_').replace('.wav','')
    def encode(stem,y,g):
        sf.write(listen/(stem+'.wav'),y*g,48000,subtype='PCM_16')
        subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(listen/(stem+'.wav')),'-b:a','160k',str(listen/(stem+'.mp3'))],check=True)
    for key,y in waves.items():encode(name(key),y,gain)
    timelines={}
    def montage(stem,keys):
        chunks=[];timeline=[];t=0
        for key in keys:
            y=waves[key];timeline.append({'key':key,'start':t,'end':t+len(y)/48000});chunks.extend([y,np.zeros(38400)]);t+=len(y)/48000+.8
        encode(stem,np.concatenate(chunks),gain);timelines[stem]=timeline
    montage('quick_qwen_comfort_whisper',['qwen/qwen_clone_s1234.wav','drama/comfort_s1234.wav','drama/whisper_s1234.wav'])
    montage('three_contexts',['drama/comfort_s1234.wav','drama/protective_anger_s1234.wav','drama/relief_s1234.wav'])
    montage('normal_soft_whisper',['drama/neutral_s1234.wav','drama/soft_spoken_s1234.wav','drama/whisper_s1234.wav'])
    (p/'listening_levels.json').write_text(json.dumps({'common_gain_db':float(20*np.log10(gain)),'individual_normalization':False,'waveform_postprocessing':'Only preview sample-rate conversion/common gain/MP3; no pitch, timing or energy envelope edits. Montage gaps0.8seconds.','timelines':timelines},ensure_ascii=False,indent=2))
    caps=sum(x['truncated'] for x in reports['drama']['items']);bad=[x for x in audit['items'] if x.get('cer_checked',x['cer'])>.05]
    result={'drama_count':len(reports['drama']['items']),'qwen_count':len(reports['qwen']['items']),'truncated_drama_count':caps,'cer_over_5_percent_files':[x['engine']+'/'+x['file'] for x in bad],'training':False,'production_changed':False,'subjective_listening_done':False,'autonomous_context_understanding_tested':False,'all_takes_published':True,'raw_hashes_verified':True}
    (p/'evaluation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    esc=html.escape
    def player(key):return f'<audio controls preload="none" src="listening/{name(key)}.mp3"></audio>'
    def metric(key):
        e,f=key.split('/');r=byfile[e,f];v=next(x for x in phonation if x['key']==key)
        return f"{r['duration_seconds']:.1f}초 · 전사 오류율 {r.get('cer_checked',r['cer']):.1%} · 참조 유사도 {r['speaker_similarity']:.3f} · 유성 구간 추정 {v['pitch_track_voiced_fraction_in_active_frames']:.0%}"
    labels={'neutral':'기본 대화 · 연출 지시 없음','comfort':'위로','protective_anger':'억눌린 분노','relief':'안도','soft_spoken':'작은 목소리 · 보통 발성 유지','whisper':'속삭임 · 숨 섞인 무성 발성 지시'}
    sections=[]
    for id,label in labels.items():
        req=next(r for r in m['requests'] if r['id']==id);key='drama/'+id+'_s1234.wav';extra=''
        if any(r['id']==id and r['seed']==4321 for r in m['requests']):
            other='drama/'+id+'_s4321.wav';extra=f'<h3>두 번째 테이크</h3>{player(other)}<p class="metric">{metric(other)}</p>'
        row=byfile['drama',Path(key).name];windows=' / '.join(f"{w['ref_cosine']:.3f}" for w in row['speaker_windows'])
        sections.append(f'<section><h2>{label}</h2><p>{esc(req["scene"])}</p>{player(key)}<p class="metric">{metric(key)}</p><details><summary>다른 테이크·검사·연출 지시</summary>{extra}<p>첫 테이크 전사: {esc(row.get("transcript_checked",row["transcript"]))}</p><p>앞/중간/끝 참조 유사도: {windows}</p><p class="metric">{esc(req["tagged_text"])}</p></details></section>')
    page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drama3 긴 대사·속삭임 비교</title><style>body{{max-width:1000px;margin:40px auto;padding:0 20px;background:#10131c;color:#eef;font:17px/1.65 system-ui}}section{{background:#1b2232;border-radius:18px;padding:24px;margin:20px 0}}audio{{width:min(100%,600px)}}h1,h2{{line-height:1.3}}h3{{font-size:17px}}.metric{{font-size:14px;color:#bbc4da}}.note{{border-left:4px solid #ffc478;padding:15px}}a{{color:#beaaff}}summary{{cursor:pointer}}details p{{overflow-wrap:anywhere}}</style><h1>007번 목소리, 긴 대사와 속삭임</h1><p>Drama3 10개 · 기존 Qwen1.7B 모델 2개 · 모두 추가 학습 없음</p><p class="note">동일한007번 녹음과 같은134자 문단으로 비교했습니다. 맥락을 연출 지시로 바꿔 Drama3에 입력했습니다. Qwen은 기존 Base 클로닝 모델로 새 문단만 생성했으며 연기 지시는 지원하지 않는 경로입니다. 감정 연기나 진짜 속삭임을 자동 검사로 확정하지 않았습니다.</p><section><h2>먼저 한 번에 듣기</h2><p>Qwen 클로닝 → Drama3 위로 → Drama3 속삭임</p><audio controls preload="metadata" src="listening/quick_qwen_comfort_whisper.mp3"></audio><p class="metric">모든 음성에 동일한 재생 게인. 속도·피치·강약 후처리 없음.</p></section><section><h2>세 가지 맥락</h2><p>위로 → 억눌린 분노 → 안도</p><audio controls preload="none" src="listening/three_contexts.mp3"></audio></section><section><h2>속삭임과 작은 목소리 구분</h2><p>기본 대화 → 작은 목소리 → 속삭임</p><audio controls preload="none" src="listening/normal_soft_whisper.mp3"></audio><p class="metric">유성 구간 추정치는 성대 진동의 간접 지표입니다. 수치가 낮아도 숨·마찰음·검출 오류일 수 있어 실제 속삭임 판정은 아닙니다.</p></section><section><h2>공통 대사</h2><p>{esc(m['text'])}</p><p class="metric">주요 청취점: 마지막까지007번으로 들리는가 · 대본 낭독처럼 끊기지 않는가 · 맥락에 맞게 달라지는가 · 속삭임이 단순히 작아진 소리와 다른가</p></section><section><h2>기존 Qwen1.7B Base 클로닝</h2>{player('qwen/qwen_clone_s1234.wav')}<p class="metric">{metric('qwen/qwen_clone_s1234.wav')}</p><details><summary>두 번째 테이크</summary>{player('qwen/qwen_clone_s4321.wav')}<p class="metric">{metric('qwen/qwen_clone_s4321.wav')}</p></details></section>{''.join(sections)}<section><h2>007번 원본 참조</h2><audio controls preload="none" src="drama/reference.wav"></audio><p>{esc(m['reference_text'])}</p><p class="metric">현재007번은 비교용 여성 목소리입니다. 참조 유사도는 속삭임으로 발성이 바뀌어도 떨어질 수 있으므로 화자 유지의 확정 판정에 쓰지 않습니다.</p></section><p>검사: Drama3 잘림 {caps}개 · 전체 전사 오류율5% 초과 {len(bad)}개 · 모든 테이크 공개</p><p>Built with Fish Audio · <a href="RESULTS.md">실험 결과와 한계</a> · <a href="evaluation.json">검사 요약</a> · <a href="audit/audit.json">전사·구간별 검사</a> · <a href="phonation.json">발성 진단</a> · <a href="https://huggingface.co/fishaudio/drama-3">공식 모델</a> · <a href="http://127.0.0.1:8801/compare.html">이전 짧은 대사</a></p></html>'''
    (p/'compare.html').write_text(page)
    rows=[]
    for r in audit['items']:
        key=r['engine']+'/'+r['file'];v=next(x for x in phonation if x['key']==key)
        rows.append(f"|{key}|{r['duration_seconds']:.2f}|{r.get('cer_checked',r['cer']):.1%}|{r['speaker_similarity']:.3f}|{v['pitch_track_voiced_fraction_in_active_frames']:.1%}|{r['speech_rms_median_dbfs']:.2f}|")
    notes=f'''# Drama3 long-form and whisper test —2026-10-23

Generated10 Drama3 zero-shot takes and2 fresh baseline takes using the same unchanged Qwen1.7B Base model. No fine-tuning, no production changes. Old Qwen/GPT-SoVITS assets remain unchanged. This new paragraph had no existing matching Qwen file.

## Protocol

Same134character/87Korean-syllable paragraph and original007 reference ({m['reference_sha256']}). Neutral and soft-spoken controls: seed1234. Comfort, protective restrained anger, relief and whisper: seeds1234/4321. Full paragraph generated in one request; no manual sentence splicing. Every requested take is published. Primary previews always use seed1234, never listening-based selection. Raw WAVs preserved with SHA256 checks; common preview gain {20*np.log10(gain):.2f}dB, sample-rate conversion and MP3 only. Montage gaps0.8seconds.

The Korean scene descriptions were translated into inline acting directions per phrase. Raw previous dialogue is not input. This tests conditional delivery and persistence across a paragraph, not automatic context comprehension. Qwen Base ICL has no supported acting-instruction path in this comparison; therefore it is a baseline cloning comparison, not a head-to-head instructed whisper benchmark.

## Checks

Drama3 frame-cap truncations: {caps}. Clips with ASR CER over5%: {len(bad)}. One Qwen initial timestamp-enabled ASR pass hallucinated repetitions at zero-duration timestamps; two independent no-timestamp checks (VAD on/off) agreed at CER2.3%. Displayed CER uses that agreed recheck; the initial transcript is retained. Exact transcripts, word timestamps, estimated gaps and first/middle/end six-second reference-embedding windows appear in audit/audit.json. Whispered speech can have ASR errors without text generation errors; inspect/listen before attributing cause.

|File|Seconds|ASR CER|Reference cosine|Tracked voiced fraction|Median active RMS dBFS|
|---|---:|---:|---:|---:|---:|
'''+ '\n'.join(rows)+f'''

Speaker cosine: Resemblyzer, no silence trimming for all reference/generated audio, full clip and6second windows. It is sensitive to wording, phonation and silence and cannot certify same identity. pYIN tracked voiced fraction among relative-energy active frames,60–600Hz/16kHz/2048frame/256hop. Low voiced fraction may indicate whisper, breath/frication or tracking failure; it is not a whisper or naturalness score. All metrics are diagnostic. No human listening preference or emotion-label judgement was performed.

## Reproducibility

Fish source {reports['drama']['source_commit']}; Drama3 revision {reports['drama']['revision']}. Qwen revision {reports['qwen']['revision']}. Drama settings {json.dumps(m['drama_settings'])}; Qwen max_new_tokens900/native defaults, no instructions. Full prompts/seeds: manifest.json; generation time, finish reasons and hashes: engine report.json. This native inference run is not an optimized production latency benchmark.

Built with Fish Audio. Eligibility under Fish Audio Community License confirmed by user in this session (aggregate trailing12month revenue belowUSD500000). [Official model and license](https://huggingface.co/fishaudio/drama-3). No generic public TTS service or training on Fish outputs performed. All speech is non-explicit and actor007 source is previously authorized.
'''
    (p/'RESULTS.md').write_text(notes);print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
