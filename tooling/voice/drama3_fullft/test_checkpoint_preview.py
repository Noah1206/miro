"""Actual serialization round trip, including lazy tensors and corruption rejection."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import torch
from safetensors import safe_open
from .checkpoint_preview import stream_state, native_shapes, export_checkpoint
from .core import SOURCE_REV, MODEL_REV
from .live_export import verify_native_files


class Lazy:
    def __init__(self, value):
        self.value, self.shape = value, value.shape
    def contiguous(self):
        return self.value.contiguous()


class PreviewExportTest(unittest.TestCase):
    def test_lazy_fp32_to_native_bf16_preserves_values_and_omits_teacher(self):
        state = {'backbone.a': Lazy(torch.arange(12, dtype=torch.float32).reshape(3, 4)/7),
                 'audio_decoder.b': Lazy(torch.tensor([.12345, -.98765])),
                 'korean_teacher_head.weight': Lazy(torch.ones(2, 2))}
        expected = {'a': (3, 4), 'b': (2,)}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch('tooling.voice.drama3_fullft.checkpoint_preview.export_name', side_effect=lambda n:n.split('.', 1)[1]):
                result = stream_state(state, root, expected, max_bytes=24)
            self.assertEqual(result, {'bytes':28, 'tensors':2, 'shards':2})
            self.assertEqual(native_shapes(root), expected)
            (root/'EXPORT_COMPLETE.json').write_text(json.dumps(result))
            self.assertEqual(verify_native_files(root)['verified_tensors'], 2)
            index = json.loads((root/'model.safetensors.index.json').read_text())
            for key, source in [('a', state['backbone.a']), ('b', state['audio_decoder.b'])]:
                with safe_open(str(root/index['weight_map'][key]), framework='pt') as f:
                    torch.testing.assert_close(f.get_tensor(key), source.value.to(torch.bfloat16), rtol=0, atol=0)
            with (root/next(iter(index['weight_map'].values()))).open('ab') as f:
                f.write(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                verify_native_files(root)

    def test_step23_export_checks_persisted_ranks_without_claiming_engine_reload(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);checkpoint=root/'step-000023';checkpoint.mkdir()
            assets=root/'assets';assets.mkdir()
            files={}
            for rank in range(8):
                for name in [f'bf16_zero_pp_rank_{rank}_mp_rank_00_optim_states.pt',
                             f'zero_pp_rank_{rank}_mp_rank_00_model_states.pt',
                             f'rank-{rank:02d}.json',f'rng-rank-{rank:02d}.pt']:
                    (checkpoint/name).write_bytes(b'x');files[name]=1
            complete={'tag':'step-000023','client':{'step':23,'world_size':8,
                'source_commit':SOURCE_REV,'model_revision':MODEL_REV},
                'files':files,'ranks':[{'rank':r} for r in range(8)]}
            (checkpoint/'COMPLETE.json').write_text(json.dumps(complete))
            (checkpoint/'VOLUME_COMMITTED.json').write_text(json.dumps({'step':23}))
            # Stop before any real model read: reaching the shape gate proves all
            # persisted-file gates passed without inventing a GPU reload witness.
            with patch('tooling.voice.drama3_fullft.checkpoint_preview.read_contract',return_value={'codec_file_sha256':'x'}), \
                 patch('tooling.voice.drama3_fullft.checkpoint_preview.file_sha256',return_value='x'), \
                 patch('tooling.voice.drama3_fullft.checkpoint_preview.native_shapes',return_value={}):
                with self.assertRaisesRegex(ValueError,'actual full-size'):
                    export_checkpoint(checkpoint,assets,root/'native',expected_step=23,require_independent_reload=False)
                with self.assertRaisesRegex(ValueError,'independent reload'):
                    export_checkpoint(checkpoint,assets,root/'native',expected_step=23)
                (checkpoint/next(iter(files))).write_bytes(b'')
                with self.assertRaisesRegex(ValueError,'Incomplete training checkpoint'):
                    export_checkpoint(checkpoint,assets,root/'native',expected_step=23,require_independent_reload=False)


    def test_incompatible_shape_cannot_publish_weights(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch('tooling.voice.drama3_fullft.checkpoint_preview.export_name', return_value='a'):
                with self.assertRaisesRegex(ValueError, 'shape mismatch'):
                    stream_state({'backbone.a':Lazy(torch.ones(3))}, folder, {'a':(4,)})
            self.assertFalse((Path(folder)/'model.safetensors.index.json').exists())


if __name__ == '__main__':
    unittest.main()
