import unittest
from .serving_measurements import summarize

class ServingCostTest(unittest.TestCase):
    def test_failures_are_costed_but_never_count_as_delivered_audio(self):
        good = {'amount':'standard','content_passed':True,'voice_approved':True,
                'finish_reason':'eos','audio_seconds':30,'generation_seconds':40}
        bad = {**good,'content_passed':False,'audio_seconds':100,'generation_seconds':60}
        result=summarize([good,bad],billed_usd=1)
        self.assertEqual(result['approved_audio_minutes'],.5)
        self.assertEqual(result['usd_per_approved_minute_including_all_billed_attempts'],2)
        self.assertEqual(result['groups']['standard']['all_attempt_generation_seconds'],100)

    def test_no_approved_output_does_not_claim_zero_cost_or_a_per_minute_rate(self):
        result=summarize([],billed_usd=2)
        self.assertEqual(result['billed_usd'],2)
        self.assertIsNone(result['usd_per_approved_minute_including_all_billed_attempts'])

if __name__=='__main__':unittest.main()
