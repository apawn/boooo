"""Persistent Qwen Base voice continuation from the selected synthetic English voice."""
import base64
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('BOOKSHELF_VOICE_HOME', HERE.parents[1] / '__voice_trials')).resolve()
PROFILE = json.loads((HERE / 'english-profile.json').read_text())
PROTOCOL = sys.stdout
os.environ.setdefault('HF_HUB_OFFLINE', '1')


def reply(value):
    PROTOCOL.write(json.dumps(value, ensure_ascii=False) + '\n')
    PROTOCOL.flush()


def load():
    import mlx.core as mx
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    reference = HERE / PROFILE['reference']
    if hashlib.sha256(reference.read_bytes()).hexdigest() != PROFILE['referenceSha256']:
        raise ValueError('English reference audio checksum mismatch')
    audio, rate = sf.read(reference, dtype='float32')
    if rate != 24000 or audio.ndim != 1:
        raise ValueError('Expected mono 24 kHz English reference')
    model = load_model(str(RUNTIME / '.engines' / PROFILE['modelDirectory']))
    return model, mx.array(audio)


def synthesize(model, reference, request):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    text = request.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 450:
        raise ValueError('Invalid English speech text')
    mx.random.seed(PROFILE['seed'])
    chunks = list(model.generate(text=text, lang_code='English', ref_audio=reference,
                                ref_text=PROFILE['referenceText'], max_tokens=2048,
                                speed=PROFILE['speed'], split_pattern=''))
    if not chunks:
        raise RuntimeError('Qwen returned empty audio')
    rate = chunks[0].sample_rate
    audio = np.concatenate([np.asarray(c.audio).reshape(-1) for c in chunks])
    if not np.isfinite(audio).all() or not np.any(audio) or len(audio) > rate * 90:
        raise RuntimeError('Invalid English speech output')
    stream = io.BytesIO()
    sf.write(stream, audio, rate, format='WAV', subtype='PCM_16')
    return base64.b64encode(stream.getvalue()).decode('ascii')


def main():
    with redirect_stdout(sys.stderr):
        model, reference = load()
    reply({'ready': True})
    for line in sys.stdin:
        request = {}
        try:
            if len(line) > 20000:
                raise ValueError('Request too large')
            request = json.loads(line)
            with redirect_stdout(sys.stderr):
                audio = synthesize(model, reference, request)
            reply({'id': request['id'], 'audio': audio})
        except Exception as error:
            print(f'English: {error}', file=sys.stderr, flush=True)
            reply({'id': request.get('id'), 'error': str(error)})


if __name__ == '__main__':
    main()
