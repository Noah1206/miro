"""CPU-only regression checks for preserving the last usable native snapshot."""
import json
from pathlib import Path
import tempfile
import unittest
from .snapshots import publish_snapshot,snapshot_destination,snapshot_due


class NativeSnapshotPublicationTest(unittest.TestCase):
    def make_snapshot(self,root,step,missing_shard=False):
        path=snapshot_destination(root,step);path.mkdir(parents=True)
        (path/'EXPORT_COMPLETE.json').write_text(json.dumps({'bytes':8,'shards':1,'tensors':1}))
        (path/'MIRO_TRAINING.json').write_text(json.dumps({'steps_completed':step,'optimizer_exported':False}))
        (path/'model.safetensors.index.json').write_text(json.dumps({'metadata':{'total_size':8},'weight_map':{'weight':'part.safetensors'}}))
        if not missing_shard:(path/'part.safetensors').write_bytes(b'fixture')
        return path

    def test_interruption_cannot_replace_last_complete_weights(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.make_snapshot(root,10)
            publish_snapshot(root,10);pointer=(root/'LATEST_NATIVE_SNAPSHOT.json').read_bytes()
            self.make_snapshot(root,20,missing_shard=True)
            with self.assertRaises(ValueError):publish_snapshot(root,20)
            self.assertEqual((root/'LATEST_NATIVE_SNAPSHOT.json').read_bytes(),pointer)
            (snapshot_destination(root,20)/'part.safetensors').write_bytes(b'fixture')
            result=publish_snapshot(root,20)
            self.assertEqual(result['step'],20)
            self.assertFalse(result['exact_optimizer_resume_available'])

    def test_marker_without_completed_export_is_not_usable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=snapshot_destination(root,10);path.mkdir(parents=True)
            (path/'part.safetensors').write_bytes(b'partial')
            with self.assertRaises(FileNotFoundError):publish_snapshot(root,10)
            self.assertFalse((root/'LATEST_NATIVE_SNAPSHOT.json').exists())

    def test_final_export_is_not_duplicated(self):
        self.assertTrue(snapshot_due(1,25));self.assertFalse(snapshot_due(2,25))
        self.assertTrue(snapshot_due(10,25));self.assertTrue(snapshot_due(20,25))
        self.assertFalse(snapshot_due(0,25));self.assertFalse(snapshot_due(25,25))


if __name__=='__main__':unittest.main()
