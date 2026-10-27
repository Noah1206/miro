import unittest
import json
import numpy as np
from .breath_data import compact_quiet,remap_time,event_training_text,require_fresh_audio_cache
from .breath_conditioned_data import prepare_event_row


class BreathDataTest(unittest.TestCase):
    def test_internal_gap_compacted_but_speech_and_real_breath_kept_exactly(self):
        sr=1000;y=np.zeros(5000,dtype=np.float32)
        y[100:1000]=.2;y[2000:2300]=np.linspace(.001,.03,300);y[3500:4300]=.1
        out,m=compact_quiet(y,sr,speech=[(.1,1),(3.5,4.3)],protected_events=[(2,2.3)],noise_floor_db=-80)
        self.assertLess(len(out),len(y))
        for a,b in [(100,1000),(2000,2300),(3500,4300)]:
            start=round(remap_time(a/sr,m)*sr)
            np.testing.assert_array_equal(out[start:start+b-a],y[a:b])
        self.assertAlmostEqual(len(out)/sr,5-m['removed_seconds'])
        json.dumps(m) # audit maps must survive durable manifest publication

    def test_quiet_whisper_word_envelope_cannot_be_cut(self):
        y=np.zeros(2000,dtype=np.float32);y[300:1700]=.00002
        out,m=compact_quiet(y,1000,speech=[(.3,1.7)],protected_events=[],noise_floor_db=-90)
        start=round(remap_time(.3,m)*1000)
        np.testing.assert_array_equal(out[start:start+1400],y[300:1700])

    def test_no_alignment_cannot_be_treated_as_all_silence(self):
        with self.assertRaises(ValueError):compact_quiet(np.zeros(1000),1000,speech=[],protected_events=[],noise_floor_db=-80)

    def test_short_natural_pause_untouched(self):
        y=np.ones(2000,dtype=np.float32)*.1;y[900:1100]=0
        out,m=compact_quiet(y,1000,speech=[(0,.8),(1.2,2)],protected_events=[],noise_floor_db=-80)
        np.testing.assert_array_equal(out,y)

    def test_unknown_breath_is_preserved_as_metadata_not_fabricated_tag(self):
        self.assertEqual(event_training_text('안녕',[],[{'verified':False}],duration=1),'안녕')

    def test_real_breath_inserted_at_validated_boundary_preserves_korean(self):
        w=[{'word':'안녕.','start':0,'end':1},{'word':' 잘가.','start':2,'end':3}]
        e={'kind':'breathing','start':1.2,'end':1.8,'after_word_index':0,'verified':True,'audio_present':True}
        self.assertEqual(event_training_text('안녕. 잘가.',w,[e],duration=3),'안녕. [breathing] 잘가.')
        with self.assertRaises(ValueError):event_training_text('다른 말',w,[e],duration=3)
        e['start']=.9
        with self.assertRaises(ValueError):event_training_text('안녕. 잘가.',w,[e],duration=3)

    def test_standalone_breath_does_not_invent_spoken_korean(self):
        e={'kind':'breathing','start':0,'end':.7,'verified':True,'audio_present':True}
        self.assertEqual(event_training_text('',[],[e],duration=.7,standalone=True),'[breathing]')
        with self.assertRaises(ValueError):event_training_text('하아',[],[e],duration=.7,standalone=True)

    def test_trimmed_audio_invalidates_old_token_and_teacher_caches(self):
        with self.assertRaises(ValueError):require_fresh_audio_cache({'sha256':'new'},{'source_sha256':'old'})
        require_fresh_audio_cache({'sha256':'same'},{'source_sha256':'same'})

    def test_new_adapter_does_not_train_unverified_style_or_synthetic_audio(self):
        row={'schema_version':'miro-breath-aware-draft-v2','source_kind':'human_recording','split':'train',
             'sha256':'a'*64,'text':'안녕','duration_seconds':1.,'delivery_instruction':'sad, whispering',
             'vocal_events':[{'verified':False}]}
        prepared=prepare_event_row(row)
        self.assertEqual(prepared['text'],'안녕')
        self.assertEqual(prepared['delivery_instruction'],'')
        self.assertEqual(row['delivery_instruction'],'sad, whispering')
        with self.assertRaises(ValueError):prepare_event_row({**row,'source_kind':'generated_audio'})
        with self.assertRaises(ValueError):prepare_event_row({**row,'split':'validation'})

if __name__=='__main__':unittest.main()
