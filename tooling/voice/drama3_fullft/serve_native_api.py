"""Launch the pinned native Fish API with the same BF16 routing as our previews.

This entry point must run on the private inference host, never the web app.
Importing it does not load a model or allocate GPU resources.
"""
import json
import os
import sys
from urllib.parse import urlsplit


def main():
    checkpoint = os.environ['MIRO_VOICE_CHECKPOINT']
    key = os.environ['MIRO_VOICE_API_KEY']
    if not key:
        raise ValueError('Private API key required')
    os.environ['FISH_DRAMA3_FP8_EXPERTS'] = '0'
    from tools.server.api_utils import parse_args
    from .native_inference import native_checkpoint_routing
    import uvicorn
    # Use the pinned source's parser/defaults, without putting API keys in argv.
    sys.argv = [sys.argv[0], '--llama-checkpoint-path', checkpoint,
                '--device', os.environ.get('MIRO_VOICE_DEVICES', 'cuda:0,cuda:1'),
                '--listen', os.environ.get('MIRO_VOICE_BIND', '127.0.0.1:8788'),
                '--workers', '1', '--max-text-length', '1200']
    args = parse_args()
    args.api_key = key
    os.environ['FISH_API_SERVER_ARGS'] = json.dumps(vars(args))
    address = urlsplit('//'+args.listen)
    if not address.hostname or not address.port:
        raise ValueError('Invalid private bind address')
    # The native model initializes in a worker thread during ASGI startup.
    # Keep routing active for its full lifetime. One process avoids model copies.
    with native_checkpoint_routing(checkpoint):
        uvicorn.run('tools.api_server:create_app', host=address.hostname,
                    port=address.port, workers=1, factory=True)


if __name__ == '__main__':
    main()
