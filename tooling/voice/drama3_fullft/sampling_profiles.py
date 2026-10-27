"""Explicit, versioned inference settings; never an automatic paid retry.

Fish's public Drama-3 Space server.py at c368729ab9347dda6635c5272ad31e6521114b79
documents silence stalls with top-k30 and maps its UI's top-k0 to4097. Our pinned
native generator requires a positive top_k: passing0 directly is NOT equivalent.
This changes inference only, not the frozen training plan or codec. The profile
is a candidate fix until a real take passes independent utterance checking.
"""

LEGACY = 'miro-legacy-070-30-v1'
UNCAPPED = 'miro-untruncated-only-v1'
SPACE = 'fish-space-untruncated-v1'
PROFILES = {
    LEGACY: {'temperature': .7, 'top_p': .7, 'top_k': 30},
    UNCAPPED: {'temperature': .7, 'top_p': .7, 'top_k': 4097},
    SPACE: {'temperature': 1., 'top_p': .9, 'top_k': 4097},
}


def sampling_profile(name):
    if name not in PROFILES:
        raise ValueError('Unknown versioned sampling profile')
    return dict(PROFILES[name])


def request_sampling(manifest, request):
    # Old evidence must remain reproducible; new requests opt in explicitly.
    name = request.get('sampling_profile', manifest.get('sampling_profile', LEGACY))
    return name, sampling_profile(name)
