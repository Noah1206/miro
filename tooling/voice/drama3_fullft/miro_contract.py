"""Pure Miro /speak -> Fish /v1/tts translation; no inference is started by import."""
import re

DELIVERY_TAGS = {
    'emotion': {'neutral': '', 'happy': 'happy', 'sad': 'sad', 'curious': 'curious',
                'hurt': 'hurt', 'jealous': 'jealous', 'angry': 'angry', 'anxious': 'anxious'},
    'tone': {'normal': '', 'soft': 'gentle', 'whisper': 'whispering', 'firm': 'firm', 'playful': 'playful'},
    'pace': {'normal': '', 'slow': 'slow speech', 'fast': 'fast speech'},
    'intensity': {'normal': '', 'soft': 'soft voice', 'strong': 'strong voice'},
}


def fish_request(body, registered_voices, *, default_voice=None):
    if not isinstance(body, dict):
        raise ValueError('Expected Miro speak object')
    text = body.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 1200:
        raise ValueError('Expected1–1200 characters')
    if re.search(r'<\|.*?\|>', text, flags=re.S):
        raise ValueError('Reserved model control token')
    if body.get('language', 'ko') != 'ko':
        raise ValueError('This Miro checkpoint is Korean-only')
    voice = body.get('voice')
    if voice is None:
        voice = default_voice
    if not isinstance(voice, str) or voice not in registered_voices:
        raise ValueError('Voice is not registered; never select another male silently')
    reference = registered_voices[voice]
    if not isinstance(reference, str) or not re.fullmatch(r'[A-Za-z0-9_\- ]{1,255}', reference):
        raise ValueError('Invalid server-owned reference identity')
    style = body.get('style', 'normal')
    if style not in ['normal', 'whisper']:
        raise ValueError('Unknown Miro delivery style')
    delivery = body.get('delivery')
    if delivery is not None and not isinstance(delivery, dict):
        raise ValueError('Expected structured delivery')
    delivery = delivery or {}
    tags = []
    for field, choices in DELIVERY_TAGS.items():
        value = delivery.get(field, 'whisper' if field == 'tone' and style == 'whisper' else 'normal' if field != 'emotion' else 'neutral')
        if value not in choices:
            raise ValueError('Unknown delivery '+field)
        if choices[value]:
            tags.append(choices[value])
    # The client applies the exact inter-utterance pause; it is never spoken or
    # misrepresented as an unsupported numeric Fish API speed/volume parameter.
    tagged_text = ('['+', '.join(tags)+'] ' if tags else '') + text.strip()
    seconds = body.get('maxAudioSeconds')
    if seconds is not None and (type(seconds) is not int or seconds not in [10, 20]):
        raise ValueError('Expected a server-owned10/20-second allowance')
    return {'text': tagged_text, 'reference_id': reference, 'format': 'wav',
            'streaming': False, 'single_chunk': False, 'use_memory_cache': 'on',
            'max_new_tokens': int(seconds * 44100 / 2048) if seconds else 0, 'temperature': .7, 'top_p': .7}
