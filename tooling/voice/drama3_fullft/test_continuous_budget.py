import unittest
from .continuous_budget import admit


class AdmissionTest(unittest.TestCase):
    def test_existing_limit_refuses_loading_only_or_unsafe_save(self):
        result=admit(72.38,30,50)
        self.assertFalse(result['admitted'])
        self.assertEqual(result['remaining_usd'],7.62)
        self.assertEqual(result['remaining_updates'],20)

    def test_twenty_more_dollars_covers_fixed_timeout_and_startup(self):
        result=admit(72.38,30,70)
        self.assertTrue(result['admitted'])
        self.assertLess(result['bounded_new_job_usd'],27.62)

    def test_bill_movement_cannot_bypass_admission(self):
        self.assertFalse(admit(73.2,30,70)['admitted'])


if __name__=='__main__':unittest.main()
