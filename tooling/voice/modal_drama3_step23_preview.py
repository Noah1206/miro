"""Single-attempt, budget-bounded step23 export and inference. No training."""
import json
from pathlib import Path
import modal
from modal_drama3_step5_preview import image as cpu_image, ASSETS
from modal_drama3_fullsize_listen import image as listen_image, generate as shared_generate
from modal_drama3_compare import voices,cache

app=modal.App('miro-drama3-step23-preview-no-training')
ROOT='/voices/_drama3/fullsize-ko-007-20261024-step23-preview'
CHECKPOINT='/voices/_drama3/fullsize-ko-007-20261024-continuous-v4/arms/korean_teacher/training_checkpoints/step-000023'
NATIVE=ROOT+'/native-step-000023'
cpu_image=cpu_image.add_local_python_source('modal_drama3_step5_preview','modal_drama3_fullsize_listen')
listen_image=listen_image.add_local_python_source('modal_drama3_fullsize_listen','modal_drama3_step5_preview')

@app.function(image=cpu_image,cpu=(4,4),memory=(262144,327680),ephemeral_disk=2097152,
              timeout=900,retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices})
def export_native():
    import time,torch
    from drama3_fullft.checkpoint_preview import export_checkpoint
    voices.reload();root=Path(ROOT);root.mkdir(parents=True,exist_ok=True)
    with (root/'CPU_EXPORT_STARTED.json').open('x') as f:
        json.dump({'training':False,'time':time.time(),'automatic_retry':False},f)
    voices.commit();torch.set_num_threads(4)
    result=export_checkpoint(CHECKPOINT,ASSETS,NATIVE,expected_step=23,require_independent_reload=False)
    voices.commit()
    (Path(NATIVE)/'VOLUME_COMMITTED.json').write_text(json.dumps({'step':23,'time':time.time()}))
    voices.commit();print('STEP23_NATIVE_READY',json.dumps(result),flush=True);return result

@app.function(image=listen_image,gpu='H100:2',cpu=(8,8),memory=(131072,196608),timeout=360,
              retries=0,max_containers=1,scaledown_window=2,volumes={'/voices':voices,'/fishcache':cache})
def generate_native(manifest):
    assert len(manifest['requests'])==8
    # Execute the existing verified generator in this bounded container, no remote nesting.
    return shared_generate.local('korean_teacher',manifest,ROOT,NATIVE,expected_step=23)

@app.local_entrypoint()
def main(folder:str,phase:str='export'):
    root=Path(folder)
    if phase=='export':
        result=export_native.remote();name='export_result.json'
    elif phase=='generate':
        result=generate_native.remote(json.loads((root/'manifest.json').read_text()));name='step23_generation.json'
    else:raise ValueError('No training or other stages are available')
    (root/name).write_text(json.dumps(result,ensure_ascii=False,indent=2))
