"""Inference-only step5 preview. CPU export is explicitly separate from GPU time."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image, voices

image = (base_image.env({'DS_BUILD_OPS':'0', 'FISH_DRAMA3_FP8_EXPERTS':'0',
                        'OMP_NUM_THREADS':'4', 'MKL_NUM_THREADS':'4'})
         .pip_install('deepspeed==0.19.8', 'ninja')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare'))
app = modal.App('miro-drama3-step5-preview-no-training')
ROOT = '/voices/_drama3/fullsize-ko-007-20261024-step5-preview'
CHECKPOINT = '/voices/_drama3/fullsize-ko-007-20261024-stage20-v3/arms/korean_teacher/training_checkpoints/step-000005'
ASSETS = '/voices/_drama3/fullsize-ko-007-20261024-budget44-v1/arms/korean_teacher/snapshots/step-000001'
NATIVE = ROOT + '/native-step-000005'


@app.function(image=image, cpu=(4,4), memory=(262144,327680), ephemeral_disk=2097152,
              timeout=1200, retries=0, max_containers=1, scaledown_window=2,
              volumes={'/voices':voices})
def export_native():
    from drama3_fullft.checkpoint_preview import export_checkpoint
    import torch, time
    voices.reload()
    root = Path(ROOT)
    root.mkdir(parents=True, exist_ok=True)
    # A restarted container must not repeat the costly400GiB read/export.
    marker = root/'CPU_EXPORT_STARTED.json'
    with marker.open('x') as f:
        f.write(json.dumps({'training':False,'time':time.time(),'automatic_retry':False}))
    voices.commit()
    torch.set_num_threads(4)
    result = export_checkpoint(CHECKPOINT, ASSETS, NATIVE)
    voices.commit()
    (Path(NATIVE)/'VOLUME_COMMITTED.json').write_text(json.dumps({'time':time.time(),'step':5}))
    voices.commit()
    print('STEP5_NATIVE_READY', json.dumps(result), flush=True)
    return result


@app.local_entrypoint()
def main(folder:str):
    result = export_native.remote()
    (Path(folder)/'export_result.json').write_text(json.dumps(result, indent=2))
