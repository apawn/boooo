"""Independent British English VoiceDesign audition; does not change the reader."""
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import time

from setup import ROOT, ENGINES, download

MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit'
REVISION = 'f90d617701d9f7f4ca499291e0b57f2b3c2fd2ee'
TEXT = (
    'Why do some countries prosper, while others struggle? The answer is not simply a matter of geography. '
    'Imagine two families living on opposite sides of the same river. They share the same weather, '
    'the same landscape, and many of the same traditions. Yet their opportunities may be very different. '
    'What matters is whether people can learn, work, and build a better future. '
    '“But can things really change?” you might ask. Yes, they can. Change is rarely easy, '
    'and it seldom happens overnight. It begins when ordinary people are given a genuine chance to take part.'
)
STYLES = {
    'gentle': ('温柔英音 · 自然讲述',
        'A clear, warm adult female voice with a standard southern British English accent. '
        'Gentle, bright and relaxed, with a clean resonant tone. Speak at a comfortable conversational pace, '
        'like a thoughtful British audiobook narrator. Use natural sentence stress, connected speech, '
        'varied intonation and pauses at thought-group boundaries. Let the questions sound curious '
        'and the answers reassuring. Keep the delivery fluid rather than uniformly slow.'),
    'teacher': ('清晰英音 · 讲解节奏',
        'An articulate young adult British woman with a contemporary Received Pronunciation accent '
        'and a clear, light, warm voice. Explain this passage to an attentive adult listener. '
        'Use natural British weak forms and linking, purposeful emphasis on contrasting ideas, '
        'and subtle changes in pace. Briefly pause before an important answer. '
        'Sound friendly, engaged and conversational, with crisp diction and lively but restrained intonation.'),
}


def main():
    import importlib.metadata
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    settings = dict(model=MODEL, revision=REVISION, text=TEXT, styles=STYLES,
                    seed=42, language='English', max_tokens=2048,
                    mlx_audio=importlib.metadata.version('mlx-audio'))
    run_id = 'english-design-' + hashlib.sha256(json.dumps(settings).encode()).hexdigest()[:12]
    output = ROOT / 'output' / run_id
    output.mkdir(parents=True, exist_ok=True)
    (output / 'settings.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2))
    (output / 'text.txt').write_text(TEXT)
    model_path = download(MODEL, REVISION, ENGINES / 'qwen-voice-design-8bit',
                          allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model', '*.tiktoken'])
    start = time.monotonic()
    model = load_model(str(model_path))
    load_seconds = time.monotonic() - start
    results = {}
    for key, (label, instruction) in STYLES.items():
        target = output / f'{key}.wav'
        metadata = output / f'{key}.json'
        if target.exists() and metadata.exists():
            results[key] = json.loads(metadata.read_text())
            continue
        print(f'正在生成：{label}', flush=True)
        mx.random.seed(42)
        start = time.monotonic()
        chunks = list(model.generate_voice_design(
            text=TEXT, instruct=instruction, language='English', max_tokens=2048))
        if not chunks:
            raise RuntimeError('模型没有返回音频')
        audio = np.concatenate([np.asarray(chunk.audio).reshape(-1) for chunk in chunks])
        if not np.isfinite(audio).all() or not np.any(audio):
            raise RuntimeError('模型返回无效音频')
        sample_rate = chunks[0].sample_rate
        sf.write(target, audio, sample_rate, subtype='PCM_24')
        result = dict(label=label, generation_seconds=round(time.monotonic() - start, 2),
                      duration=round(len(audio) / sample_rate, 2), sample_rate=sample_rate,
                      peak=float(np.max(np.abs(audio))))
        metadata.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        results[key] = result
        print(json.dumps(result, ensure_ascii=False), flush=True)
    (output / 'results.json').write_text(json.dumps(
        dict(load_seconds=load_seconds, voices=results), ensure_ascii=False, indent=2))
    cards = ''.join(
        f'<section><h2>{html.escape(item["label"])}</h2>'
        f'<audio controls preload="metadata" src="{key}.wav"></audio>'
        f'<p>{item["duration"]} 秒 · 合成耗时 {item["generation_seconds"]} 秒</p>'
        f'<a href="{key}.wav" download>下载音频</a></section>'
        for key, item in results.items())
    (output / 'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Qwen 英音女声试听</title><style>'
        'body{max-width:850px;margin:48px auto;padding:0 24px;background:#f7f5ed;'
        'color:#343c32;font:18px/1.7 system-ui}section{background:#fffdf6;padding:28px;'
        'margin:24px 0;border:1px solid #dedccf;border-radius:20px}'
        'audio{width:100%}p{color:#727969}a{color:#506647}blockquote{margin:24px 0;'
        'padding:20px;border-left:3px solid #b5c2a5}h2{font-size:24px}</style>'
        '<h1>Qwen VoiceDesign · 英音女声试听</h1>'
        '<p>两种声音描述，同一段文字；保持模型原始语速，没有后期加速或减速。'
        '声音由 AI 合成，英音与自然度请以实际听感判断。</p>'
        + cards + '<h2>试听原文</h2><blockquote>' + html.escape(TEXT)
        + '</blockquote><p>独立试听，尚未替换书架声音。</p></html>')
    print(f'试听页：http://127.0.0.1:4318/{run_id}/index.html', flush=True)
    print(f'输出目录：{output}', flush=True)


if __name__ == '__main__':
    os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
    with (ROOT / '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        main()
