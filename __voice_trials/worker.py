"""Run one local voice engine in an isolated process."""
import argparse
import json
import re
from pathlib import Path
import sys
import time


def qwen(job):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    model = load_model(job['model_path'])
    for sample in job['samples']:
        mx.random.seed(42)
        start = time.monotonic()
        chunks = list(model.generate_custom_voice(
            text=sample['text'], speaker=sample['voice'], language='Chinese',
            instruct=job['instruct'], max_tokens=2048,
        ))
        if not chunks:
            raise RuntimeError('Qwen 没有返回音频')
        audio = np.concatenate([np.asarray(chunk.audio).reshape(-1) for chunk in chunks])
        if not np.isfinite(audio).all() or not np.any(audio):
            raise RuntimeError('Qwen 返回了无效音频')
        sf.write(sample['output'], audio, chunks[0].sample_rate)
        Path(sample['output']).with_suffix('.timing.json').write_text(json.dumps({
            'generation_seconds': round(time.monotonic() - start, 2),
            'audio_seconds': round(len(audio) / chunks[0].sample_rate, 2),
        }))
        print('已生成 ' + sample['output'], flush=True)


def cosy(job):
    import numpy as np
    import soundfile as sf
    import torch

    root = Path(job['engine_path'])
    sys.path[:0] = [str(root), str(root / 'third_party/Matcha-TTS')]
    from cosyvoice.cli.cosyvoice import AutoModel

    model = AutoModel(model_dir=job['model_path'], fp16=False)
    if job.get('rl'):
        checkpoint = torch.load(Path(job['model_path']) / 'llm.rl.pt', map_location='cpu', weights_only=True)
        model.model.llm.load_state_dict(checkpoint, strict=True)
        del checkpoint
        print('已加载官方 llm.rl.pt', flush=True)
    torch.manual_seed(job.get('seed', 42))
    steps = job.get('diffusion_steps', 10)
    if steps != 10:
        def set_steps(module, args, kwargs):
            if 'n_timesteps' not in kwargs:
                raise RuntimeError('当前模型解码接口不支持步数覆盖')
            if not getattr(module, '_trial_steps_logged', False):
                print(f'声学解码实际使用 {steps} 步', flush=True)
                module._trial_steps_logged = True
            return args, {**kwargs, 'n_timesteps': steps}
        model.model.flow.decoder.register_forward_pre_hook(set_steps, with_kwargs=True)
    start = time.monotonic()
    pause = job.get('sentence_pause', 0.0)
    sentences = (re.findall(r'.+?[。！？][”’」』]*|.+$', job['text'], flags=re.S)
                 if pause > 0 else [job['text']])
    parts = []
    for index, sentence in enumerate(sentences):
        if index:
            parts.append(np.zeros(round(pause * model.sample_rate), dtype=np.float32))
        continuous = job.get('continuous', False)
        if continuous:
            sentence = model.frontend.text_normalize(sentence, split=False)
        for word, pronunciation in sorted(job.get('pronunciations', {}).items(), key=lambda item: -len(item[0])):
            sentence = sentence.replace(word, pronunciation)
        if job.get('instruction'):
            chunks = list(model.inference_instruct2(
                sentence, 'You are a helpful assistant. ' + job['instruction'] + '<|endofprompt|>',
                job['ref_audio'], stream=False, speed=job.get('speed', 1.0), text_frontend=not continuous,
            ))
        else:
            chunks = list(model.inference_zero_shot(
                sentence, 'You are a helpful assistant.<|endofprompt|>' + job['ref_text'],
                job['ref_audio'], stream=False, speed=job.get('speed', 1.0), text_frontend=not continuous,
            ))
        if not chunks:
            raise RuntimeError('CosyVoice 没有返回音频')
        parts.extend(chunk['tts_speech'].cpu().numpy().reshape(-1) for chunk in chunks)
    audio = np.concatenate(parts)
    if not np.isfinite(audio).all() or not np.any(audio):
        raise RuntimeError('CosyVoice 返回了无效音频')
    sf.write(job['output'], audio, model.sample_rate, subtype='PCM_24')
    Path(job['output']).with_suffix('.timing.json').write_text(json.dumps({
        'generation_seconds': round(time.monotonic() - start, 2),
        'audio_seconds': round(len(audio) / model.sample_rate, 2),
    }))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('engine', choices=['qwen', 'cosy'])
    parser.add_argument('job', type=Path)
    args = parser.parse_args()
    {'qwen': qwen, 'cosy': cosy}[args.engine](json.loads(args.job.read_text()))
