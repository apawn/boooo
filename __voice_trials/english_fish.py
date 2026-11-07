"""Standalone Fish S2-Pro audition using a newly synthesized British female reference."""
import argparse
import fcntl
import hashlib
import html
import importlib.metadata
import json
import math
import os
import time

from setup import ROOT, ENGINES, download
from english_voice_design import TEXT, STYLES, MODEL as QWEN, REVISION as QWEN_REV

MODEL = 'mlx-community/fish-audio-s2-pro-8bit'
REVISION = 'c8d4481b3f7cbfe64d855c8b7cda7739502fc3ff'
REFERENCE = ('Take a moment to look around you. Beyond the window, the morning light is falling '
             'across the garden. There is no need to hurry. Let us turn the page, and see where the story takes us.')
VARIANTS = {
    'natural': ('自然讲述', TEXT),
    'expressive': ('轻重音与语调变化', '[warm] ' + TEXT.replace(
        '“But can things really change?”', '[curious] “But can things really change?”').replace(
        'Yes, they can.', '[confident] Yes, they can.').replace(
        'It begins when', '[warm] It begins when')),
}
VOICE_DESIGNS = {
    'gentle': ('温柔标准英音', STYLES['gentle'][1]),
    'bright': ('明亮清晰英音',
        'A young adult British woman with a bright, clear, light soprano voice and contemporary '
        'Received Pronunciation. Friendly and gently cheerful, like a British teacher explaining '
        'an interesting story. Use crisp consonants, natural weak forms, smooth connected speech, '
        'expressive sentence stress and a lively but comfortable conversational rhythm. '
        'Keep the sound clean, warm and unforced, without whispering or exaggerated acting.'),
    'composed': ('沉静成熟英音',
        'An adult British female audiobook narrator in her late thirties with a clear, smooth '
        'medium-pitched voice and a standard southern British English accent. Warm, composed '
        'and reassuring. Speak naturally with thoughtful phrasing, varied intonation, subtle '
        'changes of pace and precise diction. A gentle resonant tone with natural connected '
        'speech, not breathy, not theatrical, and not uniformly slow.'),
}


def publish_gallery():
    cards = []
    for _, (voice_label, style) in VOICE_DESIGNS.items():
        for directory in sorted((ROOT / 'output').glob('english-fish-*')):
            if not (directory / 'results.json').exists():
                continue
            settings = json.loads((directory / 'settings.json').read_text())
            if settings.get('reference_style') != style or settings.get('revision') != REVISION:
                continue
            results = json.loads((directory / 'results.json').read_text())
            for key, result in results['voices'].items():
                url = f'../{directory.name}/{key}.wav'
                cards.append(f'<section><h2>{html.escape(voice_label)} · {html.escape(result["label"])}</h2>'
                             f'<audio controls preload="metadata" src="{url}"></audio>'
                             f'<p>{result["duration"]} 秒 · 合成 {result["generation_seconds"]} 秒</p>'
                             f'<a href="{url}" download>下载音频</a></section>')
    output = ROOT / 'output' / 'english-fish-comparison'
    output.mkdir(exist_ok=True)
    (output / 'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Fish 英音女声对比</title><style>'
        'body{max-width:850px;margin:48px auto;padding:0 24px;background:#f7f5ed;'
        'color:#343c32;font:18px/1.7 system-ui}section{background:#fffdf6;padding:28px;'
        'margin:24px 0;border:1px solid #dedccf;border-radius:20px}audio{width:100%}'
        'p{color:#727969}a{color:#506647}h2{font-size:23px}</style>'
        '<h1>Fish S2-Pro · 英音女声对比</h1><p>同一段原文，三种合成女声音色参考。'
        '温柔版另外提供一份带语气变化的对照。全部由 AI 合成，目标为标准英音，'
        '口音与自然度请以试听为准；保持原始速度。</p>' + ''.join(cards)
        + '<h2>试听原文</h2><p>' + html.escape(TEXT) + '</p>'
        '<script>document.addEventListener("play", e => { if(e.target.tagName === "AUDIO") '
        'document.querySelectorAll("audio").forEach(a => {if(a !== e.target) a.pause();}); }, true);</script></html>')
    print('对比试听页：http://127.0.0.1:4318/english-fish-comparison/index.html', flush=True)


def main(reference_only=False, voice='gentle'):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    from mlx_audio.tts.utils import load_model

    voice_label, reference_style = VOICE_DESIGNS[voice]
    variants = VARIANTS if voice == 'gentle' else {'natural': VARIANTS['natural']}
    settings = dict(model=MODEL, revision=REVISION, reference_model=QWEN,
                    reference_revision=QWEN_REV, reference_text=REFERENCE,
                    reference_style=reference_style, text=TEXT, variants=variants,
                    seed=42, temperature=.7, top_p=.7, top_k=30, max_tokens=2048,
                    chunk_length=1500, speed=1.0,
                    mlx_audio=importlib.metadata.version('mlx-audio'))
    run_id = 'english-fish-' + hashlib.sha256(json.dumps(settings).encode()).hexdigest()[:12]
    output = ROOT / 'output' / run_id
    output.mkdir(parents=True, exist_ok=True)
    (output / 'settings.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2))
    (output / 'text.txt').write_text(TEXT)
    ref_file = output / 'reference.wav'
    if not ref_file.exists():
        path = download(QWEN, QWEN_REV, ENGINES / 'qwen-voice-design-8bit',
                        allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model', '*.tiktoken'])
        qwen = load_model(str(path))
        mx.random.seed(42)
        print('正在合成独立参考女声', flush=True)
        chunks = list(qwen.generate_voice_design(text=REFERENCE, instruct=reference_style,
                                                language='English', max_tokens=1024))
        audio = np.concatenate([np.asarray(c.audio).reshape(-1) for c in chunks])
        if not np.isfinite(audio).all() or not np.any(audio):
            raise RuntimeError('参考声音无效')
        sf.write(ref_file, audio, chunks[0].sample_rate, subtype='PCM_24')
        del chunks, qwen, audio
        mx.clear_cache()
    (output / 'reference.txt').write_text(REFERENCE)
    print(f'输出目录：{output}', flush=True)
    if reference_only:
        return
    path = download(MODEL, REVISION, ENGINES / 'fish-s2-pro-8bit',
                    allow_patterns=['*.json', '*.safetensors'])
    start = time.monotonic()
    model = load_model(str(path))
    load_seconds = time.monotonic() - start
    ref, sr = sf.read(ref_file, dtype='float32')
    divisor = math.gcd(sr, model.sample_rate)
    ref = mx.array(resample_poly(ref, model.sample_rate // divisor, sr // divisor))
    results = {}
    for key, (label, text) in variants.items():
        target = output / f'{key}.wav'
        metadata = output / f'{key}.json'
        if target.exists() and metadata.exists():
            results[key] = json.loads(metadata.read_text())
            continue
        mx.random.seed(42)
        start = time.monotonic()
        print(f'正在生成 Fish：{label}', flush=True)
        chunks = list(model.generate(text=text, ref_audio=ref, ref_text=REFERENCE,
                                    max_tokens=2048, chunk_length=1500, temperature=.7,
                                    top_p=.7, top_k=30, speed=1.0))
        if not chunks:
            raise RuntimeError('Fish 没有返回音频')
        audio = np.concatenate([np.asarray(c.audio).reshape(-1) for c in chunks])
        if not np.isfinite(audio).all() or not np.any(audio):
            raise RuntimeError('Fish 返回无效音频')
        sf.write(target, audio, chunks[0].sample_rate, subtype='PCM_24')
        result = dict(label=label, duration=round(len(audio) / chunks[0].sample_rate, 2),
                      generation_seconds=round(time.monotonic() - start, 2),
                      peak=float(np.max(np.abs(audio))), sample_rate=chunks[0].sample_rate,
                      peak_memory_gb=round(mx.get_peak_memory() / 1e9, 2))
        metadata.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        results[key] = result
        print(json.dumps(result, ensure_ascii=False), flush=True)
    (output / 'results.json').write_text(json.dumps(dict(load_seconds=load_seconds, voices=results),
                                                   ensure_ascii=False, indent=2))
    cards = ''.join(f'<section><h2>Fish S2-Pro · {html.escape(r["label"])}</h2>'
                    f'<audio controls preload="metadata" src="{k}.wav"></audio>'
                    f'<p>{r["duration"]} 秒 · 合成耗时 {r["generation_seconds"]} 秒</p>'
                    f'<a href="{k}.wav" download>下载音频</a></section>' for k, r in results.items())
    (output / 'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Fish S2-Pro 英语试听</title><style>'
        'body{max-width:850px;margin:48px auto;padding:0 24px;background:#f7f5ed;'
        'color:#343c32;font:18px/1.7 system-ui}section{background:#fffdf6;padding:28px;'
        'margin:24px 0;border:1px solid #dedccf;border-radius:20px}audio{width:100%}'
        'p{color:#727969}a{color:#506647}blockquote{margin:24px 0;padding:20px;'
        'border-left:3px solid #b5c2a5}h2{font-size:24px}</style>'
        f'<h1>Fish S2-Pro · {html.escape(voice_label)}</h1><p>AI 合成声音，使用 Qwen 新合成的英音女声作为参考。'
        '若显示两版，第二版增加少量语气标签。未经后期变速，尚未接入书架。</p>'
        + cards + '<section><h2>合成参考女声 · Qwen VoiceDesign</h2>'
        '<audio controls preload="metadata" src="reference.wav"></audio><p>'
        + html.escape(REFERENCE) + '</p></section><h2>试听原文</h2><blockquote>'
        + html.escape(TEXT) + '</blockquote></html>')
    print(f'试听页：http://127.0.0.1:4318/{run_id}/index.html', flush=True)
    publish_gallery()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-only', action='store_true')
    parser.add_argument('--voice', choices=VOICE_DESIGNS, default='gentle')
    args = parser.parse_args()
    os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
    with (ROOT / '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        main(args.reference_only, args.voice)
