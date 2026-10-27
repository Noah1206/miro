"""Check existing native weights on CPU; never hold GPUs while hashing files."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,voices

app=modal.App('miro-drama3-saved-weights-cpu-audit')
image=base_image.add_local_python_source('modal_drama3_compare')
for name in ['__init__.py','core.py','live_export.py']:
    image=image.add_local_file('tooling/voice/drama3_fullft/'+name,'/root/drama3_fullft/'+name)


@app.function(image=image,cpu=(2,2),memory=1024,timeout=900,retries=0,volumes={'/voices':voices})
def audit(path):
    import time
    from drama3_fullft.live_export import verify_native_files
    voices.reload();started=time.monotonic()
    print('CPU_SAVED_WEIGHT_AUDIT_STARTED',path,flush=True)
    result=verify_native_files(path)
    result.update(verified=True,seconds=time.monotonic()-started,gpu_allocated=False,
                  verifies_native_file_integrity_only=True,inference_reload_verified=False)
    print('CPU_SAVED_WEIGHT_AUDIT_COMPLETE',json.dumps(result),flush=True)
    return result


@app.local_entrypoint()
def main(folder:str,path:str):
    result=audit.remote(path)
    (Path(folder)/'native_integrity_cpu_audit.json').write_text(json.dumps(result,indent=2))
