"""Bounded2L4 full-parameter distributed smoke, not a production-size job."""
import json
from pathlib import Path
import modal
from modal_drama3_compare import image as base_image,voices
image=(base_image.env({'DS_BUILD_OPS':'0'}).pip_install('deepspeed==0.19.8','ninja')
       .add_local_python_source('drama3_fullft','modal_drama3_compare'))
app=modal.App('miro-drama3-fullft-distributed-readiness')


@app.function(image=image,gpu=['H100:2','A100-80GB:2','L4:2'],memory=16384,timeout=900,retries=0,volumes={'/voices':voices})
def validate(cpu_offload:bool=False,variable_length:bool=False,live_export:bool=False):
    import os,subprocess,zipfile
    p=Path('/voices/_drama3/fullft-readiness-20261023'+('-offload' if cpu_offload else '')+('-variable' if variable_length else '')+('-live' if live_export else ''));p.mkdir(parents=True,exist_ok=True)
    env=dict(os.environ,SMOKE_OUTPUT=str(p),OMP_NUM_THREADS='2',SMOKE_CPU_OFFLOAD='1' if cpu_offload else '0')
    env['SMOKE_VARIABLE_LENGTH']='1' if variable_length else '0'
    env['SMOKE_LIVE_EXPORT']='1' if live_export else '0'
    subprocess.run(['torchrun','--standalone','--nproc_per_node=2','--module','drama3_fullft.distributed_smoke'],env=env,check=True,timeout=600)
    result=json.loads((p/'distributed_smoke.json').read_text());voices.commit();return result


@app.local_entrypoint()
def main(folder:str,cpu_offload:bool=False,variable_length:bool=False,live_export:bool=False):
    p=Path(folder);p.mkdir(parents=True,exist_ok=True);r=validate.remote(cpu_offload,variable_length,live_export)
    filename='distributed'+('_offload' if cpu_offload else '')+('_variable' if variable_length else '')+('_live' if live_export else '')+'_smoke.json'
    (p/filename).write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
