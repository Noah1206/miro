"""Real CPU serialization checks; does not validate distributed35B export."""
from contextlib import nullcontext
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import torch
from safetensors import safe_open
from .live_export import export_live,verify_native_files
from .snapshots import publish_snapshot,snapshot_destination


class NativeExportSerializationTest(unittest.TestCase):
    def test_first_snapshot_creates_parent_and_round_trips_weights(self):
        model=torch.nn.Module()
        model.backbone=torch.nn.Linear(3,2)
        model.korean_teacher_head=torch.nn.Linear(2,2)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);original=root/'original';original.mkdir()
            (original/'config.json').write_text('{"quantization_config": {"test": true}}')
            output=root/'run';output.mkdir()
            destination=snapshot_destination(output,1)
            fake_ds=SimpleNamespace(zero=SimpleNamespace(GatheredParameters=lambda *a,**k:nullcontext()))
            with patch.dict(sys.modules,{'deepspeed':fake_ds}),patch('torch.distributed.get_rank',return_value=0),patch('torch.distributed.barrier'),patch('tooling.voice.drama3_fullft.live_export.export_name',side_effect=lambda name:name.removeprefix('backbone.')):
                result=export_live(model,original,destination,{'steps_completed':1,'codec_contract':{}},max_bytes=12)
            self.assertEqual(result['bytes'],sum(p.numel()*2 for p in model.backbone.parameters()))
            index=json.loads((destination/'model.safetensors.index.json').read_text())
            self.assertEqual(set(index['weight_map']),{'weight','bias'})
            for key,param in model.backbone.named_parameters():
                with safe_open(destination/index['weight_map'][key],framework='pt',device='cpu') as shard:
                    torch.testing.assert_close(shard.get_tensor(key),param.to(torch.bfloat16),rtol=0,atol=0)
            self.assertNotIn('quantization_config',json.loads((destination/'config.json').read_text()))
            self.assertEqual(publish_snapshot(output,1)['step'],1)
            self.assertFalse(publish_snapshot(output,1)['exact_optimizer_resume_available'])
            self.assertEqual(verify_native_files(destination)['verified_parameter_bytes'],result['bytes'])
            first_shard=destination/next(iter(index['weight_map'].values()))
            with first_shard.open('ab') as file:file.write(b'corruption')
            with self.assertRaisesRegex(ValueError,'checksum mismatch'):verify_native_files(destination)


if __name__=='__main__':unittest.main()
