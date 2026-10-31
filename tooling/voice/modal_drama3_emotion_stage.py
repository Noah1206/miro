"""감정 FullFT 단계(10/31, 사용자 승인 상한 $65): 서빙 중인 native-moan-v2 → 감정(자동 라벨) + 신음 A/B + 남성 대사, 30회.
modal_drama3_moan_stage.py 를 복사했다(신음 v2 코드는 그대로). 자동 유료 재시도 없음.

단계(phase): features(L4) → train(8×H100) → export_new(CPU) → listen(2×H100)
modal run tooling/voice/modal_drama3_emotion_stage.py --folder output/voice-upload/emotion-stage-v1 --phase <phase>
"""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image, voices, cache, MODEL_REV

ROOT = '/voices/_drama3/miro-emotion-20261031-v1'
V2_ROOT = '/voices/_drama3/miro-moan-20261029-v2'                   # 신음·남성 클립 오디오·코덱·티처 특징 재사용
V1_ROOT = '/voices/_drama3/miro-moan-20261029-v1'
OLD_ROOT = '/voices/_drama3/miro-male-asmr-01-20261026-breath-v2'   # 남성 클립 코덱·티처 특징 재사용
ASSETS = '/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'
SOURCE = V2_ROOT + '/native-moan-v2'   # 지금 서빙 중인 모델
NEW_NATIVE = ROOT + '/native-emotion-v1'
JOB_CAP_USD = 85   # 10/31 사용자 'ㄱㄱ' $65 → 선점으로 첫 학습 실패 뒤 '1번. 진행해줘' $85
image = (base_image.env({'DS_BUILD_OPS': '0', 'FISH_DRAMA3_FP8_EXPERTS': '0'})
         .pip_install('deepspeed==0.19.8', 'ninja')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare'))
app = modal.App('miro-emotion-fullft-cap65-v1')
CODE_NAMES = ['emotion_stage_train.py', 'emotion_stage_plan.py', 'breath_conditioned_data.py', 'breath_data.py', 'single_voice_plan.py',
              'core.py', 'data.py', 'codec_contract.py', 'korean_teacher.py', 'training_state.py']


def record_json(path, value):
    from drama3_fullft.training_state import atomic_json
    atomic_json(path, value)


def plain(value):
    """돌려주는 값을 JSON 으로 — 맥의 Modal 실행 환경엔 torch 가 없어 torch 객체가 섞이면 결과를 못 푼다(10/31 features 두 번 성공했는데 실패로 보임)."""
    return json.loads(json.dumps(value, default=str))


def require_auth(auth):
    if auth.get('authorized_for_paid_training') is not True or auth.get('new_job_cap_usd') != JOB_CAP_USD:
        raise ValueError('Exact user-approved $85 emotion stage required')
    if auth.get('run_root') != ROOT or not auth.get('plan_sha256') or not auth.get('training_code_sha256'):
        raise ValueError('Wrong authorized stage')


def code_sha256(code_root):
    import hashlib
    hashes = {n: hashlib.sha256((Path(code_root) / n).read_bytes()).hexdigest() for n in CODE_NAMES}
    return hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest(), hashes


@app.function(image=image, gpu=['L4', 'A10G', 'L40S', 'A100-40GB'], cpu=(4, 4), memory=(24576, 24576), timeout=600, retries=0,
              max_containers=1, scaledown_window=2, volumes={'/voices': voices, '/fishcache': cache})
def prepare_features(auth, bundle, plan, schedule, zero):
    import io, zipfile, hashlib, shutil, time, torch, torchaudio
    from transformers import HubertModel, AutoFeatureExtractor
    from fish_speech.models.text2semantic.inference import load_codec_model, encode_audio
    from drama3_fullft.korean_teacher import TEACHER_ID, TEACHER_REV, TEACHER_LAYER, align_features, build_training_stats
    from drama3_fullft.codec_contract import create_contract, validate_cache, read_contract
    from drama3_fullft.emotion_stage_plan import read_rows, build_plan, require_frozen_plan
    require_auth(auth); voices.reload(); cache.reload(); root = Path(ROOT); root.mkdir(parents=True, exist_ok=True)
    with (root / 'FEATURES_STARTED.json').open('x') as f: json.dump({'time': time.time(), 'automatic_retry': False}, f)
    voices.commit(); data_root = root / 'data'; data_root.mkdir(exist_ok=True)
    # 신음·남성 클립 오디오는 신음 v2 에 이미 있다 — 묶음에는 감정 클립만 들어 있다
    shutil.copytree(Path(V2_ROOT) / 'data' / 'wavs', data_root / 'wavs', dirs_exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        for name in archive.namelist():
            if name.startswith('/') or '..' in Path(name).parts: raise ValueError('Unsafe bundle path')
        archive.extractall(data_root)
    rows = [json.loads(x) for x in (data_root / 'recordings.jsonl').read_text().splitlines()]
    for row in rows: row['audio_path'] = str(data_root / row['audio_path'])
    (data_root / 'recordings.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    rows = read_rows(data_root / 'recordings.jsonl')
    actual = build_plan(rows, schedule, source_manifest_sha256=plan['source_checkpoint_manifest_sha256'],
                        steps=plan['steps'], mid_save_step=plan['mid_save_step'], seed=plan['seed'])
    require_frozen_plan(plan, actual)
    if auth['plan_sha256'] != plan['sha256']: raise ValueError('Bundle/plan authorization mismatch')
    (root / 'stage').mkdir(exist_ok=True)
    record_json(root / 'stage/plan.json', plan); record_json(root / 'stage/zero3.json', zero)
    (root / 'schedule.jsonl').write_text(''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in schedule))
    record_json(root / 'authorization.json', auth)
    codes = root / 'codes'; features = root / 'teacher_features'; codes.mkdir(exist_ok=True); features.mkdir(exist_ok=True)
    weights = Path(ASSETS); contract = create_contract(weights / 'codec.pth', 'bfloat16')
    if contract != read_contract(weights / 'codec_contract.json'): raise ValueError('Preserve the exact existing codec identity')
    record_json(codes / 'codec_contract.json', contract)
    codec = load_codec_model(weights / 'codec.pth', 'cuda', torch.bfloat16).eval()
    for p in codec.parameters(): p.requires_grad_(False)
    teacher = HubertModel.from_pretrained(TEACHER_ID, revision=TEACHER_REV, trust_remote_code=False, use_safetensors=True).to('cuda').eval()
    for p in teacher.parameters(): p.requires_grad_(False)
    processor = AutoFeatureExtractor.from_pretrained(TEACHER_ID, revision=TEACHER_REV, trust_remote_code=False)
    if processor.sampling_rate != 16000 or processor.do_normalize: raise ValueError('Changed teacher waveform normalization')
    begin = time.monotonic(); count = reused = 0
    for row in rows:
      try:
        # 이미 만든 클립(첫 시도 10/31 이 100개 남김)은 다시 만들지 않는다
        done_code, done_feature = codes / (row['clip_id'] + '.pt'), features / (row['clip_id'] + '.pt')
        if done_code.is_file() and done_feature.is_file():
            count += 1; continue
        path = Path(row['audio_path']); sha = hashlib.sha256(path.read_bytes()).hexdigest()
        if sha != row['sha256']: raise ValueError('Uploaded audio differs from frozen manifest')
        base = next((Path(b) for b in [V2_ROOT, V1_ROOT, OLD_ROOT] if (Path(b) / 'codes' / (row['clip_id'] + '.pt')).is_file()), Path(OLD_ROOT))
        old_code = base / 'codes' / (row['clip_id'] + '.pt')
        old_feature = base / 'teacher_features' / (row['clip_id'] + '.pt')
        if old_code.is_file() and old_feature.is_file():
            c = torch.load(old_code, map_location='cpu', weights_only=True); f = torch.load(old_feature, map_location='cpu', weights_only=True)
            try:
                old_codes = validate_cache(c, sha, contract)
                ok = (f.get('source_sha256') == sha and f.get('teacher_revision') == TEACHER_REV and f.get('layer') == TEACHER_LAYER
                      and f.get('codec_profile_id') == contract['codec_profile_id'] and tuple(f['features'].shape) == (old_codes.shape[-1], 1024))
            except ValueError: ok = False
            if ok:
                shutil.copy2(old_code, codes / old_code.name); shutil.copy2(old_feature, features / old_feature.name)
                count += 1; reused += 1; continue
        with torch.inference_mode(): code = encode_audio(path, codec, 'cuda').cpu().long()
        payload = {'codes': code, 'source_sha256': sha, 'codec_profile_id': contract['codec_profile_id'], 'codec_revision': MODEL_REV}
        validate_cache(payload, sha, contract); torch.save(payload, codes / (row['clip_id'] + '.pt'))
        wav, sr = torchaudio.load(path); wav = torchaudio.functional.resample(wav.mean(0), sr, 16000)
        inputs = processor(wav.numpy(), sampling_rate=16000, return_tensors='pt').input_values.to('cuda')
        with torch.inference_mode():
            states = teacher(inputs, output_hidden_states=True).hidden_states[TEACHER_LAYER][0].float()
            aligned = align_features(states, code.shape[-1]).half().cpu()
        if not torch.isfinite(aligned).all(): raise ValueError('Nonfinite teacher feature')
        torch.save({'features': aligned, 'source_sha256': sha, 'teacher_id': TEACHER_ID, 'teacher_revision': TEACHER_REV,
                    'layer': TEACHER_LAYER, 'codec_profile_id': contract['codec_profile_id'], 'original_teacher_frames': len(states)},
                   features / (row['clip_id'] + '.pt'))
        count += 1
        if count % 50 == 0:
            record_json(root / 'FEATURES_PROGRESS.json', {'clips': count, 'total': len(rows)}); voices.commit(); print('EMOTION_FEATURES', count, '/', len(rows), flush=True)
      except Exception as e:
        # 로컬에 torch 가 없어 원래 예외는 풀리지 않는다 — 볼륨에 글로 남기고 글로 바꿔 올린다
        import traceback
        (root / 'FEATURES_ERROR.txt').write_text(f"{row['clip_id']} {row.get('split')} {row.get('duration_seconds')}s\n" + traceback.format_exc())
        voices.commit()
        raise RuntimeError(f"features failed at {row['clip_id']}: {type(e).__name__}: {e}") from None
    stats = build_training_stats(features, rows, contract)
    result = {'complete': True, 'clips': count, 'reused_clips': reused, 'training_clip_hashes_bound': len(stats['training_source_hashes']),
              'codec_contract': contract, 'seconds': time.monotonic() - begin}
    record_json(root / 'FEATURES_COMPLETE.json', result); voices.commit(); cache.commit(); return plain(result)


@app.function(image=image, gpu='H100:8', cpu=(16, 16), memory=(655360, 917504), ephemeral_disk=2097152,
              timeout=5500, retries=0, max_containers=1, scaledown_window=2, volumes={'/voices': voices})
def train(auth):
    import os, signal, subprocess, time, shutil
    import drama3_fullft
    require_auth(auth); begin = time.monotonic(); voices.reload(); root = Path(ROOT); out = root / 'stage'
    if not json.loads((root / 'FEATURES_COMPLETE.json').read_text())['complete']: raise ValueError('Features incomplete')
    # 선점(10/31 첫 시도 13회째)되면 Modal 이 같은 입력으로 이 함수를 다시 부른다 — 그때는 마지막 저장 지점부터 이어 간다.
    started = root / 'TRAINING_STARTED.json'
    resume = None
    if started.exists():
        latest = out / 'training_checkpoints' / 'LATEST_TRAINING_CHECKPOINT.json'
        if latest.is_file():
            tag = json.loads(latest.read_text())['tag']; folder = out / 'training_checkpoints' / tag
            if (folder / 'COMPLETE.json').is_file() and (folder / 'VOLUME_COMMITTED.json').is_file(): resume = folder
        record_json(root / ('TRAINING_RESTARTED_' + str(int(time.time())) + '.json'), {'resume_from': str(resume) if resume else None})
        print('EMOTION_RESTART', str(resume) if resume else 'fresh-from-source', flush=True)
    else:
        with started.open('x') as f: json.dump({'time': time.time(), 'authorization': auth, 'automatic_retry': False}, f)
    code_root = Path(next(iter(drama3_fullft.__path__)))
    code_sha, hashes = code_sha256(code_root)
    if code_sha != auth['training_code_sha256']: raise ValueError('Trainer differs from the approved frozen code')
    frozen = out / 'code'; frozen.mkdir(exist_ok=True)
    for name in CODE_NAMES: shutil.copy2(code_root / name, frozen / name)
    record_json(out / 'CODE_SHA256SUMS.json', hashes)
    deadline = time.time() + 5400   # 로드+사전평가 ~860s, 업데이트 ~72s×30, 저장 ~450s×3(10·20·30회) + 사후평가 → ~4700s
    live_auth = {**auth, 'training_deadline_unix': deadline, 'checkpoint_reserve_seconds': 600}
    record_json(root / 'training_authorization.json', live_auth); voices.commit()
    command = ['torchrun', '--standalone', '--nproc_per_node=8', '--module', 'drama3_fullft.emotion_stage_train',
               '--manifest', str(root / 'data/recordings.jsonl'), '--schedule', str(root / 'schedule.jsonl'),
               '--output', str(out), '--assets', ASSETS, '--codes', str(root / 'codes'), '--teacher-features', str(root / 'teacher_features'),
               '--authorization', str(root / 'training_authorization.json')] + (['--resume-checkpoint', str(resume)] if resume else ['--source23-native', SOURCE])
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True,
                               env=dict(os.environ, OMP_NUM_THREADS='2', MKL_NUM_THREADS='2', TOKENIZERS_PARALLELISM='false'))
    try:
        with (out / 'training.log').open('w') as log:
            for line in process.stdout:
                log.write(line); log.flush(); print(line, end='', flush=True)
                if line.startswith('MALE_STAGE_UPDATE '): record_json(out / 'progress.json', json.loads(line.split(' ', 1)[1]))
                elif line.startswith('AB_RESUME_CHECKPOINT '):
                    checkpoint = json.loads(line.split(' ', 1)[1]); folder = Path(checkpoint['path']); started = time.monotonic()
                    voices.commit()
                    record_json(folder / 'VOLUME_COMMITTED.json', {'step': checkpoint['client']['step'], 'commit_seconds': time.monotonic() - started, 'time': time.time()})
                    voices.commit(); print('EMOTION_CHECKPOINT_DURABLE', checkpoint['client']['step'], flush=True)
            code = process.wait(timeout=10)
        if code: raise RuntimeError('Training failed; no automatic paid retry. Source weights and any saved state preserved.')
        result = json.loads((out / 'CHECKPOINT_HANDOFF.json').read_text()); result['seconds'] = time.monotonic() - begin
        record_json(root / 'TRAINING_RESULT.json', result); voices.commit(); return plain(result)
    finally:
        if process.poll() is None: os.killpg(process.pid, signal.SIGKILL)
        voices.commit()


@app.function(image=image, cpu=(4, 4), memory=(262144, 327680), ephemeral_disk=2097152,
              timeout=1100, retries=0, max_containers=1, scaledown_window=2, volumes={'/voices': voices})
def export_new(auth):
    import time, torch
    from drama3_fullft.checkpoint_preview import export_checkpoint
    require_auth(auth); voices.reload(); root = Path(ROOT)
    handoff = json.loads((root / 'stage/CHECKPOINT_HANDOFF.json').read_text()); step = handoff['new_stage_step']
    if not 1 <= step <= 30: raise ValueError('No learned checkpoint to export')
    with (root / 'EXPORT_STARTED.json').open('x') as f: json.dump({'time': time.time(), 'automatic_retry': False}, f)
    voices.commit(); torch.set_num_threads(4)
    result = export_checkpoint(handoff['path'], ASSETS, NEW_NATIVE, expected_step=step, require_independent_reload=False)
    dest = Path(NEW_NATIVE)
    metadata = json.loads((dest / 'MIRO_TRAINING.json').read_text())
    metadata.update(json.loads((root / 'stage/NEW_STAGE_METADATA.json').read_text()), steps_completed=step, new_stage_steps_completed=step,
                    checkpoint=handoff['path'], inference_export_only=True, independent_engine_reload_verified=False)
    record_json(dest / 'MIRO_TRAINING.json', metadata)
    record_json(dest / 'CPU_INDEX_VERIFICATION.json', {'native_parameter_bytes': result['bytes'], 'native_tensors': result['tensors'],
                'all_headers_index_shapes_reopened_and_verified': True, 'independent_full_payload_readback': False})
    voices.commit(); record_json(dest / 'VOLUME_COMMITTED.json', {'step': step, 'time': time.time()}); voices.commit()
    result.update(native=str(dest)); record_json(root / 'EXPORT_RESULT.json', result); voices.commit(); return plain(result)


@app.function(image=image, gpu='H100:2', cpu=(8, 8), memory=(131072, 196608), timeout=1200, retries=0,
              max_containers=1, scaledown_window=2, volumes={'/voices': voices})
def listen(auth, manifest):
    """같은 문장을 감정 태그만 바꿔 생성 — 감정이 구분되는지 + 신음 회귀 확인. 참조는 감정 데이터가 없는 목소리(남성)도 포함."""
    import gc, hashlib, time, random, os, shutil, torch, numpy as np, soundfile as sf
    from fish_speech.models.text2semantic.inference import init_model, load_codec_model, decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.codec_contract import validate_cache
    from drama3_fullft.sampling_profiles import request_sampling
    from drama3_fullft.utterance_diagnostics import completion_gate, frame_diagnostics, generation_status, trace_eos
    from drama3_fullft.emotion_stage_plan import compile_row
    os.environ['FISH_DRAMA3_CUDA_GRAPH'] = '0'
    require_auth(auth); voices.reload(); root = Path(ROOT); out = root / 'listening'; out.mkdir(exist_ok=True)
    for request in manifest['requests']: request_sampling(manifest, request)
    with (out / 'STARTED.json').open('x') as f: json.dump({'time': time.time(), 'automatic_retry': False}, f)
    record_json(out / 'manifest.json', manifest); voices.commit()
    rows = {r['clip_id']: r for r in [json.loads(x) for x in (root / 'data/recordings.jsonl').read_text().splitlines()]}
    contract = json.loads((root / 'codes/codec_contract.json').read_text())
    weights = Path(NEW_NATIVE)
    if not (weights / 'VOLUME_COMMITTED.json').exists(): raise ValueError('Uncommitted inference weights')
    with native_checkpoint_routing(weights): model, _ = init_model(weights, 'cuda:0,cuda:1', torch.bfloat16, compile=False)
    model.eval(); codec = load_codec_model(weights / 'codec.pth', str(model.device), torch.bfloat16).eval()
    report = {'items': [], 'audio_postprocessing': False}
    for request in manifest['requests']:
        ref = compile_row(rows[request['reference_clip_id']])
        codes = validate_cache(torch.load(root / 'codes' / (ref['clip_id'] + '.pt'), map_location='cpu', weights_only=True), ref['sha256'], contract)
        shutil.copy2(ref['audio_path'], out / ('reference_' + ref['clip_id'] + '.wav'))
        sampling_name, sampling = request_sampling(manifest, request)
        random.seed(request['seed']); np.random.seed(request['seed']); torch.manual_seed(request['seed']); torch.cuda.manual_seed_all(request['seed'])
        started = time.monotonic()
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + request['tagged_text'], model.tokenizer, model.config,
                                         ['<|speaker:0|>' + ref['text']], [codes])
            with trace_eos(model, **sampling) as token_trace:
                frames, finish = generate_drama3(model, prompt, max_new_tokens=request['max_new_tokens'], **sampling)
            if len(frames) == 0: raise ValueError('Empty generated audio')
            token_summary = frame_diagnostics(frames, model.config.semantic_start_token_id)
            wave = decode_to_audio(frames[:, 1:].T.contiguous().to(model.device), codec).float().cpu().numpy().squeeze()
        if wave.ndim != 1 or not len(wave) or not np.isfinite(wave).all(): raise ValueError('Invalid waveform')
        name = 'emotion_' + request['id'] + '.wav'; sf.write(out / name, wave, codec.sample_rate, subtype='FLOAT')
        token_file = 'emotion_' + request['id'] + '.frames.pt'; torch.save(frames.cpu(), out / token_file)
        record_json(out / ('emotion_' + request['id'] + '.eos.json'), token_trace)
        duration = len(wave) / codec.sample_rate
        report['items'].append({**request, 'sampling_profile': sampling_name, 'file': name, 'finish_reason': finish,
                                'truncated': finish != 'eos', 'duration_seconds': duration, 'generation_seconds': time.monotonic() - started,
                                'completion_check': completion_gate(request['text'], finish, duration=duration) if request['text'] else None,
                                'frame_diagnostics': token_summary, 'raw_token_file': token_file,
                                'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest()})
        record_json(out / 'report.json', report); voices.commit(); print('EMOTION_LISTEN', request['id'], finish, flush=True)
    del model, codec; gc.collect(); torch.cuda.empty_cache()
    report.update(status=generation_status(report['items']), generation_complete=True,
                  utterance_completeness_verified=False, subjective_quality_verified=False, ready_for_serving=False)
    record_json(out / 'report.json', report); voices.commit(); return plain(report)


# features: L4 자리 없을 때 대체 GPU 중 가장 비싼 쪽 기준 상한
RATES = {'features': (2.5 + 4 * .0473 + 24 * .008) / 3600, 'train': (8 * 3.95 + 16 * .0473 + 896 * .008) / 3600,
         'export_new': (4 * .0473 + 320 * .008) / 3600, 'listen': (2 * 3.95 + 8 * .0473 + 192 * .008) / 3600}
SECONDS = {'features': 692, 'train': 5592, 'export_new': 1192, 'listen': 1292}   # 함수 timeout + 시작 여유(선점 재시작 1번 더는 상한 밖 — 사용자 상한 $85 안)
DEPENDS = {'train': ['features'], 'export_new': ['train'], 'listen': ['export_new']}


@app.local_entrypoint()
def main(folder: str, phase: str):
    import subprocess, time
    root = Path(folder); auth = json.loads((root / 'authorization.json').read_text()); require_auth(auth)
    bounds = {k: RATES[k] * v for k, v in SECONDS.items()}
    if phase not in bounds: raise ValueError('Unknown paid phase')
    for dep in DEPENDS.get(phase, []):
        if not (root / (dep + '_result.json')).is_file(): raise ValueError('Missing prerequisite ' + dep)
    limit = json.loads((root / 'SPEND_LIMIT_VERIFIED.json').read_text())['limit']
    bill = json.loads(subprocess.check_output(['/Users/johyeon-ung/.miro/voice-venv/bin/modal', 'billing', 'summary', '--json'], text=True))
    (root / ('billing-before-' + phase + '.json')).write_text(json.dumps(bill, indent=2))
    history = root / 'phase-history'; history.mkdir(exist_ok=True)
    states = {p.stem: json.loads(p.read_text()) for p in history.glob('*.json')}
    if phase in states: raise ValueError('Already dispatched, no automatic paid retry')
    reserved = sum(s['upper_bound_usd'] for s in states.values())
    remaining = sum(b for k, b in bounds.items() if k not in states)
    if reserved + remaining + .25 > JOB_CAP_USD: raise ValueError(f'Stage cannot fit ${JOB_CAP_USD} cap: {reserved + remaining:.2f}')
    if float(bill['billed_cost']) + bounds[phase] + .5 > float(limit): raise ValueError('Workspace spend limit would stop this phase midway')
    state = {'upper_bound_usd': bounds[phase], 'at': time.time(), 'status': 'dispatching', 'automatic_retry': False}
    path = history / (phase + '.json')
    with path.open('x') as f: json.dump(state, f, indent=2)
    try:
        if phase == 'features':
            plan = json.loads((root / 'plan.json').read_text()); zero = json.loads((root / 'zero3.json').read_text())
            schedule = list(map(json.loads, (root / 'schedule.jsonl').read_text().splitlines()))
            result = prepare_features.remote(auth, (root / 'bundle.zip').read_bytes(), plan, schedule, zero)
        elif phase == 'train': result = train.remote(auth)
        elif phase == 'export_new': result = export_new.remote(auth)
        else: result = listen.remote(auth, json.loads((root / 'listening_manifest.json').read_text()))
        (root / (phase + '_result.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
        state['status'] = 'completed'; state['upper_bound_usd'] = min(bounds[phase], (time.time() - state['at'] + 10) * RATES[phase])
        print('EMOTION_PAID_PHASE_COMPLETE', phase, f"bound=${state['upper_bound_usd']:.2f}", flush=True)
    except BaseException:
        state['status'] = 'failed_or_unknown_no_retry'; raise
    finally:
        state['ended_at'] = time.time(); path.write_text(json.dumps(state, indent=2))
