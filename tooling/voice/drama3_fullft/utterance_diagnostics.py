"""Utterance completion checks and non-random eager-decoder diagnostics.

These checks do not measure acting or voice identity. A failed check must not
cause an automatic paid retry. Probability traces require a real forward pass;
they cannot be reconstructed from an already decoded WAV.
"""
from contextlib import contextmanager
import math
import re


def korean_text(text):
    return re.sub('[^가-힣]', '', text)


def character_error_rate(expected, actual):
    a, b = korean_text(expected), korean_text(actual)
    if not a:
        raise ValueError('Expected Korean utterance')
    row = list(range(len(b) + 1))
    for i, left in enumerate(a, 1):
        previous, row[0] = row[0], i
        for j, right in enumerate(b, 1):
            previous, row[j] = row[j], min(
                row[j] + 1, row[j-1] + 1, previous + (left != right))
    return row[-1] / len(a)


def completion_gate(expected, finish_reason, *, transcript=None, duration=None):
    """Separate completed computation from a verified complete spoken utterance.

    EOS alone is insufficient. Uncertain whisper ASR is sent to review instead
    of approved, edited, or retried automatically. This is deliberately a narrow
    coverage gate, not a claim of naturalness or emotion quality.
    """
    if not isinstance(expected, str) or not korean_text(expected):
        raise ValueError('Expected nonempty Korean text')
    failures = []
    if finish_reason != 'eos':
        failures.append('missing_eos')
    if duration is not None and (not math.isfinite(duration) or duration <= 0):
        failures.append('invalid_audio_duration')
    error = None
    if transcript is None:
        failures.append('content_not_checked')
    else:
        error = character_error_rate(expected, transcript)
        if error > .25:
            failures.append('large_transcript_mismatch')
        tail = korean_text(expected)[-6:]
        if tail not in korean_text(transcript):
            failures.append('utterance_ending_not_confirmed')
    return {
        'passed': not failures, 'failures': failures, 'automatic_cer': error,
        'review_required': bool(failures), 'automatic_paid_retry': False,
        'naturalness_or_voice_identity_verified': False,
    }


def generation_status(items):
    if not items:
        raise ValueError('No generated takes')
    # Report execution completion even for diagnostic failures, but never call a
    # length-limited batch successful synthesis. Keep every failed take.
    return 'complete' if all(x['finish_reason'] == 'eos' for x in items) else 'complete_with_quality_failure'


@contextmanager
def trace_eos(model, *, temperature, top_k, top_p):
    """Record EOS support for each real main-token draw without resampling.

    Use eager inference: CUDA graph capture cannot run Python per-step hooks.
    No extra model forward is executed and no random numbers are drawn here.
    Restore the method even when generation fails.
    """
    import torch
    if getattr(model, 'decode_graphs', None) is not None:
        raise ValueError('EOS tracing requires eager inference without captured graphs')
    backbone = model.backbone
    original = backbone.compute_logits
    had_instance_method = 'compute_logits' in backbone.__dict__
    previous_instance_method = backbone.__dict__.get('compute_logits')
    values = []
    trace = {'eos_token_id': model.config.eos_token_id,
             'sampling': {'temperature': temperature, 'top_k': top_k, 'top_p': top_p},
             'candidate_pool': 'EOS plus unchanged semantic token band',
             'extra_model_forwards': 0, 'random_draws': 0, 'steps': []}

    def recorded(hidden):
        logits = original(hidden)
        if logits.ndim != 2 or len(logits) != 1:
            raise ValueError('Expected one eager decode row')
        eos = model.config.eos_token_id
        candidates = torch.cat((torch.tensor([eos], device=logits.device),
            torch.arange(model.config.semantic_start_token_id,
                         model.config.semantic_end_token_id + 1,
                         device=logits.device))).sort().values
        raw = logits.detach()[0, candidates].float()
        scaled, order = torch.sort(raw / max(temperature, 1e-5), descending=True)
        probabilities = scaled.softmax(-1)
        dropped = (probabilities.cumsum(-1) > top_p) | (torch.arange(
            len(raw), device=logits.device) >= top_k)
        dropped[0] = False
        is_eos = candidates[order] == eos
        eos_rank = torch.arange(1, len(raw)+1, device=logits.device)[is_eos].sum()
        values.append(torch.stack((raw.softmax(-1)[candidates == eos].sum(),
            eos_rank.float(), ((~dropped) & is_eos).any().float(),
            probabilities[is_eos].sum())).detach())
        return logits

    backbone.compute_logits = recorded
    try:
        yield trace
    finally:
        if had_instance_method:
            backbone.compute_logits = previous_instance_method
        else:
            del backbone.compute_logits
        for i, row in enumerate(torch.stack(values).cpu().tolist() if values else []):
            trace['steps'].append({'draw_index': i, 'eos_raw_probability': row[0],
                'eos_rank_in_candidate_pool': int(row[1]),
                'eos_in_primary_sampling_support': bool(row[2]),
                'eos_temperature_scaled_probability': row[3]})


def frame_diagnostics(frames, semantic_start):
    """Diagnostic summary; keep raw frames separately for codec/stop analysis."""
    import torch
    if frames.ndim != 2 or frames.shape[1] != 11 or not len(frames):
        raise ValueError('Expected generated [frames, semantic+10codebooks]')
    if frames.dtype != torch.int64:
        raise ValueError('Expected integer audio tokens')
    if not torch.equal(frames[:, 0], frames[:, 1] + semantic_start):
        raise ValueError('Generated semantic and codec0 tokens disagree')
    codes = frames[:, 1:]
    for i, size in enumerate([4096] + [1024] * 9):
        if int(codes[:, i].min()) < 0 or int(codes[:, i].max()) >= size:
            raise ValueError('Generated codec token out of range')
    return {'generated_frames': len(frames), 'raw_frames_saved': True,
            'unique_tokens_per_codebook': [int(codes[:, i].unique().numel()) for i in range(10)],
            'consecutive_identical_frame_fraction': float((codes[1:] == codes[:-1]).all(-1).float().mean()) if len(codes) > 1 else 0.}
