"""Actual CPU Adam/RNG trajectory recovery and incomplete-checkpoint rejection."""
import copy
import json
from pathlib import Path
import random
import tempfile
import types
import unittest

import numpy as np
import torch
from .training_state import capture_rng,restore_rng,rng_digest,optimizer_fingerprint,publish_training_state,validate_optimizer_file,latest_committed_checkpoint,prepare_low_peak_checkpoint_load


class TrainingStateTest(unittest.TestCase):
    def test_private_mmap_adam_resume_preserves_future_updates_and_source_file(self):
        torch.manual_seed(21);first=torch.nn.Linear(4,2);adam=torch.optim.AdamW(first.parameters(),lr=.001)
        x=torch.randn(5,4)
        def update(model,optimizer):
            optimizer.zero_grad();loss=model(x).square().mean();loss.backward();optimizer.step()
        update(first,adam)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'checkpoint.pt';torch.save({'model':first.state_dict(),'optimizer':adam.state_dict()},path)
            before=path.read_bytes();update(first,adam)
            second=torch.nn.Linear(4,2);other=torch.optim.AdamW(second.parameters(),lr=.001)
            update(second,other)  # Allocate the disposable fresh Adam moments.
            engine=types.SimpleNamespace(checkpoint_engine=types.SimpleNamespace(name='TorchCheckpointEngine'),
                optimizer=types.SimpleNamespace(optimizer=other))
            prepare_low_peak_checkpoint_load(engine);self.assertFalse(other.state)
            state=engine.checkpoint_engine.load(str(path),map_location='cpu')
            second.load_state_dict(state['model']);other.load_state_dict(state['optimizer']);update(second,other)
            for left,right in zip(first.parameters(),second.parameters()):torch.testing.assert_close(left,right,rtol=0,atol=0)
            self.assertEqual(path.read_bytes(),before)

    def test_adam_and_rng_resume_same_future_updates(self):
        random.seed(93);np.random.seed(94);torch.manual_seed(95)
        first=torch.nn.Sequential(torch.nn.Linear(4,8),torch.nn.Dropout(.4),torch.nn.Linear(8,1))
        adam=torch.optim.AdamW(first.parameters(),lr=1e-3)
        def update(model,optimizer):
            x=torch.randn(6,4)*(random.random()+float(np.random.rand()))
            loss=model(x).square().mean();loss.backward();optimizer.step();optimizer.zero_grad();return loss.detach()
        update(first,adam)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'state.pt'
            state={'model':first.state_dict(),'optimizer':adam.state_dict(),'rng':capture_rng(),'next_data_index':6}
            torch.save(state,path)
            expected_witness=optimizer_fingerprint(adam);expected_rng=rng_digest(capture_rng())
            expected=[update(first,adam) for _ in range(3)]
            loaded=torch.load(path,weights_only=False)
            second=torch.nn.Sequential(torch.nn.Linear(4,8),torch.nn.Dropout(.4),torch.nn.Linear(8,1))
            other=torch.optim.AdamW(second.parameters(),lr=1e-3)
            second.load_state_dict(loaded['model']);other.load_state_dict(loaded['optimizer']);restore_rng(loaded['rng'])
            self.assertEqual(optimizer_fingerprint(other),expected_witness)
            self.assertEqual(rng_digest(capture_rng()),expected_rng)
            self.assertEqual(loaded['next_data_index'],6)
            actual=[update(second,other) for _ in range(3)]
            for a,b in zip(actual,expected):torch.testing.assert_close(a,b,rtol=0,atol=0)
            for a,b in zip(first.parameters(),second.parameters()):torch.testing.assert_close(a,b,rtol=0,atol=0)

    def test_missing_rank_cannot_replace_previous_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);pointer=root/'LATEST_TRAINING_CHECKPOINT.json';pointer.write_text('{"old":true}')
            before=pointer.read_bytes();folder=root/'step-10';folder.mkdir()
            with self.assertRaisesRegex(ValueError,'rank'):
                publish_training_state(root,'step-10',{'world_size':8},[{'rank':i} for i in range(7)])
            self.assertEqual(pointer.read_bytes(),before)

    def test_zero_shard_metadata_requires_adam_moments(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'optim.pt'
            good={'optimizer_state_dict':{'zero_stage':3,'partition_count':8,'fp32_flat_groups':[torch.ones(7)],
                'optimizer_state_dict':{'state':{0:{'exp_avg':torch.zeros(7),'exp_avg_sq':torch.zeros(7)}}}}}
            torch.save(good,path);self.assertEqual(validate_optimizer_file(path,8)['fp32_partition_elements'],7)
            del good['optimizer_state_dict']['optimizer_state_dict']['state'][0]['exp_avg_sq']
            torch.save(good,path)
            with self.assertRaisesRegex(ValueError,'Adam moments'):validate_optimizer_file(path,8)

    def test_recovery_ignores_uncommitted_or_truncated_newer_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for step in [5,10]:
                folder=root/f'step-{step:06d}';folder.mkdir();(folder/'payload').write_bytes(b'complete')
                manifest={'client':{'step':step},'path':str(folder),'files':{'payload':8}}
                (folder/'COMPLETE.json').write_text(json.dumps(manifest))
            (root/'step-000005/VOLUME_COMMITTED.json').write_text('{"step":5}')
            self.assertEqual(latest_committed_checkpoint(root)['client']['step'],5)
            (root/'step-000010/VOLUME_COMMITTED.json').write_text('{"step":10}')
            self.assertEqual(latest_committed_checkpoint(root)['client']['step'],10)
            (root/'step-000010/payload').write_bytes(b'partial')
            self.assertEqual(latest_committed_checkpoint(root)['client']['step'],5)


if __name__=='__main__':unittest.main()
