"""CPU regression checks for the six failed takes and lossless EOS tracing."""
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
import torch
from .utterance_diagnostics import (completion_gate, generation_status,
                                   frame_diagnostics, trace_eos)
from .sampling_profiles import LEGACY, SPACE, sampling_profile, request_sampling


class CompletionTests(unittest.TestCase):
    text = '괜찮아. 서두르지 않아도 돼. 내가 여기 있을게.'

    def test_observed_only_first_clause_is_not_success_even_if_eos(self):
        result = completion_gate(self.text, 'eos', transcript='괜찮아', duration=1.)
        self.assertFalse(result['passed'])
        self.assertIn('utterance_ending_not_confirmed', result['failures'])
        self.assertAlmostEqual(result['automatic_cer'], 5/6)
        self.assertFalse(result['automatic_paid_retry'])

    def test_full_transcript_cannot_hide_missing_eos(self):
        check = completion_gate(self.text, 'length', transcript=self.text, duration=14.86)
        self.assertEqual(check['failures'], ['missing_eos'])

    def test_eos_alone_cannot_prove_utterance_coverage(self):
        self.assertEqual(completion_gate(self.text, 'eos')['failures'], ['content_not_checked'])

    def test_complete_utterance_is_a_coverage_pass_not_a_naturalness_score(self):
        result = completion_gate(self.text, 'eos', transcript=self.text, duration=6.)
        self.assertTrue(result['passed'])
        self.assertFalse(result['naturalness_or_voice_identity_verified'])

    def test_diagnostic_batch_keeps_failure_distinct_from_completion(self):
        self.assertEqual(generation_status([{'finish_reason':'length'}]), 'complete_with_quality_failure')
        self.assertEqual(generation_status([{'finish_reason':'eos'}]), 'complete')
        with self.assertRaises(ValueError):generation_status([])

    def test_all_six_real_failed_outputs_rejected_without_a_model_call(self):
        path=Path(__file__).resolve().parents[3]/'output/voice-upload/male-asmr-01-20261026/paid-stage-v1/listening/local_audit.json'
        if not path.exists():self.skipTest('Local experiment evidence absent')
        rows=json.loads(path.read_text())['items']
        self.assertEqual(len(rows),6)
        for row in rows:
            result=completion_gate(row['text'],row['finish_reason'],
                transcript=row['automatic_transcript'],duration=row['duration_seconds'])
            self.assertFalse(result['passed'])
            self.assertIn('missing_eos',result['failures'])
            self.assertIn('large_transcript_mismatch',result['failures'])


class HistoricalCompletionTests(unittest.TestCase):
    def test_same_model_seed_pair_accepts_complete_take_only(self):
        folder=Path(__file__).resolve().parents[3]/'output/voice-upload/male-asmr-01-20261026/diagnosis-local'
        if not (folder/'HISTORICAL_RECHECK.json').exists():self.skipTest('Historical evidence absent')
        rows=json.loads((folder/'HISTORICAL_RECHECK.json').read_text())['items']
        checks=[]
        for seed,finish in [(1234,'length'),(4321,'eos')]:
            row=next(x for x in rows if x['arm']=='original' and Path(x['file']).name==f'relief_s{seed}.wav')
            checks.append(completion_gate('괜찮아. 나 여기 있어.',finish,
                transcript=row['automatic_transcript'],duration=row['seconds'])['passed'])
        self.assertEqual(checks,[False,True])


class TraceTests(unittest.TestCase):
    def model(self):
        class Head(torch.nn.Module):
            def compute_logits(self, hidden):return hidden * 1.
        return SimpleNamespace(backbone=Head(),decode_graphs=None,
            config=SimpleNamespace(eos_token_id=1,semantic_start_token_id=3,semantic_end_token_id=5))

    def test_trace_does_not_change_logits_or_rng_and_restores_method(self):
        model=self.model();hidden=torch.tensor([[0.,-1.,0.,4.,2.,1.]])
        expected=model.backbone.compute_logits(hidden);rng=torch.get_rng_state().clone()
        with trace_eos(model,temperature=.7,top_k=2,top_p=.7) as trace:
            actual=model.backbone.compute_logits(hidden)
        torch.testing.assert_close(actual,expected,rtol=0,atol=0)
        self.assertTrue(torch.equal(rng,torch.get_rng_state()))
        self.assertNotIn('compute_logits',model.backbone.__dict__)
        self.assertEqual(len(trace['steps']),1)
        self.assertEqual(trace['steps'][0]['eos_rank_in_candidate_pool'],4)
        self.assertFalse(trace['steps'][0]['eos_in_primary_sampling_support'])

    def test_trace_restores_method_on_failure_and_preserves_instance_override(self):
        model=self.model();fn=lambda hidden:hidden
        model.backbone.compute_logits=fn
        with self.assertRaises(RuntimeError):
            with trace_eos(model,temperature=.7,top_k=2,top_p=.7):raise RuntimeError('stop')
        self.assertIs(model.backbone.compute_logits,fn)

    def test_eos_as_top_candidate_is_available_to_sampler(self):
        model=self.model();hidden=torch.tensor([[0.,10.,0.,1.,0.,0.]])
        with trace_eos(model,temperature=.7,top_k=1,top_p=.1) as trace:
            model.backbone.compute_logits(hidden)
        self.assertEqual(trace['steps'][0]['eos_rank_in_candidate_pool'],1)
        self.assertTrue(trace['steps'][0]['eos_in_primary_sampling_support'])

    def test_raw_frame_consistency_is_checked_before_codec_decode(self):
        frames=torch.zeros(3,11,dtype=torch.int64);frames[:,0]=100
        self.assertEqual(frame_diagnostics(frames,100)['generated_frames'],3)
        frames[1,0]+=1
        with self.assertRaisesRegex(ValueError,'disagree'):frame_diagnostics(frames,100)

    def test_uncapped_profile_preserves_low_rank_speech_and_eos_candidates(self):
        # Construct the documented mechanism, not a claim about unobserved35B
        # logits: a pause's top30 codes suppress rank31+ speech/EOS candidates.
        model=self.model()
        model.config.semantic_start_token_id=3
        model.config.semantic_end_token_id=4098
        hidden=torch.zeros(1,4099)
        hidden[0,3:33]=1.
        hidden[0,1]=.5
        with trace_eos(model,temperature=1.,top_k=30,top_p=.9) as capped:
            model.backbone.compute_logits(hidden)
        with trace_eos(model,**sampling_profile(SPACE)) as uncapped:
            model.backbone.compute_logits(hidden)
        self.assertEqual(capped['steps'][0]['eos_rank_in_candidate_pool'],31)
        self.assertFalse(capped['steps'][0]['eos_in_primary_sampling_support'])
        self.assertTrue(uncapped['steps'][0]['eos_in_primary_sampling_support'])


class SamplingProfileTests(unittest.TestCase):
    def test_old_manifest_keeps_original_settings_and_new_profile_is_explicit(self):
        self.assertEqual(request_sampling({},{}),(LEGACY,{'temperature':.7,'top_p':.7,'top_k':30}))
        self.assertEqual(request_sampling({'sampling_profile':SPACE},{})[1]['top_k'],4097)
        self.assertEqual(request_sampling({'sampling_profile':SPACE},{'sampling_profile':LEGACY})[0],LEGACY)

    def test_zero_is_not_passed_to_native_sampler_and_caller_cannot_mutate_profile(self):
        profile=sampling_profile(SPACE)
        self.assertGreater(profile['top_k'],0)
        profile['top_k']=0
        self.assertEqual(sampling_profile(SPACE)['top_k'],4097)
        with self.assertRaises(ValueError):sampling_profile('unrecorded-experiment')


if __name__=='__main__':unittest.main()
