"""Regression checks for silent token-space/profile mismatches; no model training."""
import json,tempfile,unittest
from pathlib import Path
import torch
from .codec_contract import (create_contract,read_contract,validate_cache,
                             validate_training_contract,validate_serving_checkpoint)


class CodecContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);(self.root/'codec.pth').write_bytes(b'fixture codec weights')
        self.contract=create_contract(self.root/'codec.pth','bfloat16')
        (self.root/'codec_contract.json').write_text(json.dumps(self.contract))
        self.data={'source_sha256':'a'*64,'codec_profile_id':self.contract['codec_profile_id'],
                   'codes':torch.zeros(10,8,dtype=torch.long)}

    def test_valid_contract_and_all_codebooks(self):
        self.data['codes'][0]=4095;self.data['codes'][1:]=1023
        self.assertEqual(validate_cache(self.data,'a'*64,self.contract).shape,(10,8))
        self.assertEqual(validate_training_contract(self.root,self.root),self.contract)
        self.assertEqual(validate_serving_checkpoint(self.root),self.contract)

    def test_legacy_cache_rejected(self):
        del self.data['codec_profile_id']
        with self.assertRaisesRegex(ValueError,'legacy'):validate_cache(self.data,'a'*64,self.contract)

    def test_precision_mixing_rejected(self):
        other=create_contract(self.root/'codec.pth','float32')
        with self.assertRaisesRegex(ValueError,'Mixed'):validate_cache(self.data,'a'*64,other)

    def test_semantic_only_targets_rejected(self):
        self.data['codes']=self.data['codes'][:1]
        with self.assertRaisesRegex(ValueError,'all10'):validate_cache(self.data,'a'*64,self.contract)

    def test_residual_vocab_not_semantic_vocab(self):
        self.data['codes'][1,0]=1024
        with self.assertRaisesRegex(ValueError,'vocabulary'):validate_cache(self.data,'a'*64,self.contract)

    def test_changed_source_rejected(self):
        with self.assertRaisesRegex(ValueError,'source'):validate_cache(self.data,'b'*64,self.contract)

    def test_changed_codec_weights_rejected(self):
        (self.root/'codec.pth').write_bytes(b'changed encoder or decoder weights')
        with self.assertRaisesRegex(ValueError,'differs'):validate_training_contract(self.root,self.root)
        with self.assertRaisesRegex(ValueError,'changed'):validate_serving_checkpoint(self.root)

    def test_modified_contract_rejected(self):
        self.contract['precision']='float32';(self.root/'codec_contract.json').write_text(json.dumps(self.contract))
        with self.assertRaisesRegex(ValueError,'Corrupt'):read_contract(self.root/'codec_contract.json')

    def test_fp32_targets_require_serving_alignment(self):
        contract=create_contract(self.root/'codec.pth','float32')
        (self.root/'codec_contract.json').write_text(json.dumps(contract))
        with self.assertRaisesRegex(ValueError,'BF16'):validate_training_contract(self.root,self.root)


if __name__=='__main__':unittest.main()
