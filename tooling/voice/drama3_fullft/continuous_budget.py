"""Admit one useful, saved continuation; never spend a small balance on loading only."""
HOUR_RATE_UPPER=8*3.95+16*.0473+896*.008
CALL_TIMEOUT_SECONDS=2380
STARTUP_ALLOWANCE_SECONDS=90
LOAD_FORWARD_MEASURED_SECONDS=290.235104941
UPDATE_MEASURED_SECONDS=78.14767711733332
SAVE_COMMIT_MEASURED_SECONDS=409.750812093


def admit(net_billed,paid_cash,additional_total_ceiling,checkpoint_step=5,target_step=25):
    if target_step<=checkpoint_step:raise ValueError('No new training requested')
    remaining=paid_cash+additional_total_ceiling-net_billed
    bound=HOUR_RATE_UPPER*(CALL_TIMEOUT_SECONDS+STARTUP_ALLOWANCE_SECONDS)/3600+.10
    measured_seconds=LOAD_FORWARD_MEASURED_SECONDS+(target_step-checkpoint_step)*UPDATE_MEASURED_SECONDS+SAVE_COMMIT_MEASURED_SECONDS
    return {'admitted':remaining>=bound,'remaining_usd':round(remaining,2),
        'bounded_new_job_usd':round(bound,4),'measured_projection_usd':round(measured_seconds*HOUR_RATE_UPPER/3600,4),
        'shortfall_to_bounded_job_usd':round(max(0,bound-remaining),2),
        'checkpoint_step':checkpoint_step,'target_step':target_step,
        'remaining_updates':target_step-checkpoint_step,'one_load_one_save':True,
        'extra_fresh_gpu_verification_jobs':0,'native_inference_export_in_gpu_job':False,
        'cost_optimized_does_not_guarantee_voice_quality':True}
