"""Persistent local Qwen Serena synthesis; newline JSON on stdin/stdout."""
import base64
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('BOOKSHELF_VOICE_HOME', HERE.parents[1] / '__voice_trials')).resolve()
PROFILES = json.loads((HERE / 'profiles.json').read_text())
PROTOCOL = sys.stdout
os.environ.setdefault('HF_HUB_OFFLINE', '1')


def reply(value):
    PROTOCOL.write(json.dumps(value, ensure_ascii=False) + '\n')
    PROTOCOL.flush()


def load():
    from mlx_audio.tts.utils import load_model
    return load_model(str(RUNTIME / '.engines/qwen-model'))


def synthesize(model, backend, request):
    import numpy as np
    import soundfile as sf
    voice = PROFILES['voices'][request['voice']]
    if voice['backend'] != backend:
        raise ValueError('Voice/backend mismatch')
    phrases = request['phrases']
    if (not isinstance(phrases, list) or not phrases or len(phrases) > 20
            or not all(isinstance(p, str) and p.strip() and len(p) <= 95 for p in phrases)
            or sum(map(len, phrases)) > 450):
        raise ValueError('Invalid speech text')
    parts = []
    rate = 24000
    import mlx.core as mx
    from tempo import time_stretch_wsola
    for text in phrases:
        mx.random.seed(42)
        chunks = list(model.generate_custom_voice(text=text, speaker=voice['speaker'],
                      language='Chinese', instruct=PROFILES['style'], max_tokens=2048))
        if not chunks:
            raise RuntimeError('Qwen returned empty audio')
        rate = chunks[0].sample_rate
        audio = np.concatenate([np.asarray(c.audio).reshape(-1) for c in chunks])
        parts.append(time_stretch_wsola(audio, rate=voice['tempo'], sample_rate=rate))
    audio = np.concatenate(parts)
    if not np.isfinite(audio).all() or not np.any(audio) or len(audio) > rate * 180:
        raise RuntimeError('Invalid speech output')
    stream = io.BytesIO()
    sf.write(stream, audio, rate, format='WAV', subtype='PCM_16')
    return base64.b64encode(stream.getvalue()).decode('ascii')


def main():
    backend = sys.argv[1]
    if backend != 'qwen':
        raise ValueError('Unknown backend')
    with redirect_stdout(sys.stderr):
        model = load()
    reply({'ready': True})
    for line in sys.stdin:
        request = {}
        try:
            if len(line) > 20000:
                raise ValueError('Request too large')
            request = json.loads(line)
            with redirect_stdout(sys.stderr):
                audio = synthesize(model, backend, request)
            reply({'id': request['id'], 'audio': audio})
        except Exception as error:
            print(f'{backend}: {error}', file=sys.stderr, flush=True)
            reply({'id': request.get('id'), 'error': str(error)})


if __name__ == '__main__':
    main()
