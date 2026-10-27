"""Publish usable intermediate native weights without claiming optimizer resume."""
import json
from pathlib import Path


def snapshot_due(step,total_steps,interval=10):
    if interval<1:raise ValueError('Snapshot interval must be positive')
    return 0<step<total_steps and (step==1 or step%interval==0)


def snapshot_destination(output,step):
    if step<1:raise ValueError('Snapshot step must be positive')
    return Path(output)/'snapshots'/f'step-{step:06d}'


def publish_snapshot(output,step):
    """Only advertise a snapshot after every native weight shard was exported."""
    output=Path(output);destination=snapshot_destination(output,step)
    complete=json.loads((destination/'EXPORT_COMPLETE.json').read_text())
    training=json.loads((destination/'MIRO_TRAINING.json').read_text())
    if training['steps_completed']!=step or training.get('optimizer_exported'):
        raise ValueError('Unexpected native snapshot contract')
    index=json.loads((destination/'model.safetensors.index.json').read_text())
    shards=set(index['weight_map'].values())
    if not shards or len(shards)!=complete['shards']:
        raise ValueError('Missing native snapshot shard index')
    if complete['bytes']!=index['metadata']['total_size']:
        raise ValueError('Native snapshot byte count mismatch')
    if any(Path(name).name!=name or not (destination/name).is_file() or (destination/name).stat().st_size==0 for name in shards):
        raise ValueError('Native snapshot has an absent or unsafe weight shard')
    result={'step':step,'path':str(destination),'inference_weights_complete':True,
            'optimizer_state_saved':False,'exact_optimizer_resume_available':False,
            'quality_approved':False,'native_export':complete}
    temporary=output/'LATEST_NATIVE_SNAPSHOT.json.tmp'
    temporary.write_text(json.dumps(result,indent=2)+'\n')
    temporary.replace(output/'LATEST_NATIVE_SNAPSHOT.json')
    return result
