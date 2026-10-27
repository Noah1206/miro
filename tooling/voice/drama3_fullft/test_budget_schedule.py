"""Exercise a whole bounded stage instead of a periodic-save implementation."""
import unittest
from .resumable_fullsize import budget_checkpoint_due


class BudgetScheduleTests(unittest.TestCase):
    def test_single_save_allows_non_multiple_of_five_and_leaves_reload_time(self):
        now=210.;end=1550.;reload_time=350.;save_time=500.;step=1;saves=[]
        while step<25:
            now+=85.;step+=1
            if budget_checkpoint_due(step,25,now,end-reload_time,save_time,85.):
                saves.append(step);now+=save_time;break
        now+=reload_time
        self.assertEqual(saves,[6])
        self.assertLessEqual(now,end)
        self.assertLess(step,25)

    def test_slow_recent_update_preserves_save_reserve(self):
        self.assertFalse(budget_checkpoint_due(7,25,500.,1100.,300.,85.))
        self.assertTrue(budget_checkpoint_due(7,25,500.,1100.,300.,280.))

    def test_goal_always_saves_even_without_a_deadline(self):
        self.assertTrue(budget_checkpoint_due(25,25,0.,0.,300.,85.))
        self.assertFalse(budget_checkpoint_due(5,25,0.,0.,300.,85.))

    def test_declared_resource_bounds_fit_the_twenty_dollar_stage(self):
        gpu_hour=8*3.95+16*.0473+896*.008
        cpu_hour=4*.0473+128*.008
        self.assertLess(gpu_hour*1680/3600+cpu_hour*1800/3600+.94,20.)
        # Once the CPU proof has actually completed, its observed duration can
        # release unused reservation to this one GPU stage, without raising20.
        cpu_completed_bound=.36
        self.assertLess(gpu_hour*1720/3600+cpu_completed_bound+.75,20.)


if __name__=='__main__':unittest.main()
