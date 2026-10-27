"""Summarize actual serving attempts. Never loads a model or launches paid work."""
def summarize(items, *, billed_usd=None, planning_krw_per_usd=1500):
    groups = {}
    for amount in ('standard', 'extended'):
        attempts = [x for x in items if x.get('amount') == amount]
        good = [x for x in attempts if x.get('content_passed') is True
                and x.get('voice_approved') is True and x.get('finish_reason') == 'eos']
        seconds = sum(x['audio_seconds'] for x in good)
        total_wall = sum(x['generation_seconds'] for x in attempts)
        groups[amount] = {
            'attempts': len(attempts), 'approved_outputs': len(good),
            'approved_audio_seconds': seconds, 'all_attempt_generation_seconds': total_wall,
            'compute_seconds_per_approved_audio_second': total_wall / seconds if seconds else None,
        }
    good_seconds = sum(x['approved_audio_seconds'] for x in groups.values())
    return {'groups': groups, 'billed_usd': billed_usd,
            'approved_audio_minutes': good_seconds / 60,
            'usd_per_approved_minute_including_all_billed_attempts': billed_usd / (good_seconds / 60)
            if billed_usd is not None and good_seconds else None,
            'krw_per_approved_minute': billed_usd * planning_krw_per_usd / (good_seconds / 60)
            if billed_usd is not None and good_seconds else None,
            'zero_approved_outputs_is_not_free_inference': not bool(good_seconds),
            'include_model_load_idle_save_and_failed_attempts_in_billed_usd': True}
