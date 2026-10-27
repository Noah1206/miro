"""Read native backbone aliases with the pinned Fish inference loader.

The pinned backbone loader explicitly accepts model.* names, but its parent
from_pretrained filters only model.language_model.* from the tower stream.
This adapter changes tensor routing only; every stored tensor stays unchanged.
"""
from contextlib import contextmanager
import json
from pathlib import Path


@contextmanager
def native_checkpoint_routing(checkpoint, module=None):
    if module is None:
        from fish_speech.models.text2semantic.fish_omni import model as module
    path = Path(checkpoint)/'model.safetensors.index.json'
    index = json.loads(path.read_text()) if path.exists() else {'weight_map':{}}
    has_native_aliases = any(k.startswith('model.') and not k.startswith('model.language_model.')
                             for k in index['weight_map'])
    original = module.iter_checkpoint_tensors
    def routed(folder, *, skip_prefixes):
        if has_native_aliases and 'lm_head.weight' in skip_prefixes:
            skip_prefixes = (*skip_prefixes, 'model.')
        yield from original(folder, skip_prefixes=skip_prefixes)
    module.iter_checkpoint_tensors = routed
    try:
        yield {'native_backbone_aliases':has_native_aliases, 'stored_weights_modified':False}
    finally:
        module.iter_checkpoint_tensors = original
