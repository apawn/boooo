"""Generate independent bright, gentle female voices using all three engines."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import time

from setup import ROOT, prepare_qwen, prepare_cosy, prepare_index
from trial import OUTPUT, NAMES, report, worker, execute, valid_audio, write_json

STYLE = '用清脆、明亮、轻盈的年轻女声说标准普通话，带自然的少女感。语气温柔放松，咬字清楚，语速稍慢，停顿自然。'
TEXT = '早上好，今天的阳光很温暖。窗外有轻轻的风，桌上放着一杯刚泡好的茶。先把忙碌的事情放一放，安静地读一会儿书吧。生活里那些细小的美好，值得我们慢慢发现。希望你今天心情轻松，也能好好照顾自己。'
REFERENCE_TEXT = '早上好，愿你今天也有一个轻松愉快的好心情。'


def main():
    import soundfile as sf
    settings = {'version': 1, 'style': STYLE, 'text': TEXT,
                'reference_text': REFERENCE_TEXT, 'reference_kind': 'synthetic_qwen_vivian',
                'cosy': {'speed': .95, 'sentence_pause': .2, 'diffusion_steps': 32},
                'index': {'seed': 0, 'max_text_tokens': 30, 'diffusion_steps': 32}}
    run_id = 'bright-' + hashlib.sha256(json.dumps(settings, ensure_ascii=False).encode()).hexdigest()[:12]
    directory = OUTPUT / run_id
    directory.mkdir(parents=True, exist_ok=True)
    write_json(directory / 'settings.json', settings)
    (directory / 'text.txt').write_text(TEXT)
    records_file = directory / 'results.json'
    records = json.loads(records_file.read_text())['voices'] if records_file.exists() else {}
    for key in NAMES:
        if key not in records or not valid_audio(directory / f'{key}.wav'):
            records[key] = {'status': '待生成'}
    descriptions = {'serena': '预设 Serena · 清脆温柔风格指令',
                    'vivian': '预设 Vivian · 清脆温柔风格指令',
                    'cosy': '新合成女声参考 · 温柔普通话指令',
                    'index': '新合成女声参考 · 分句朗读'}

    def refresh():
        for key in records:
            records[key]['description'] = descriptions[key]
            if records[key].get('tempo_rate'):
                records[key]['description'] += f" · {records[key]['tempo_rate']:.2f} 倍语速"
        report(directory, TEXT, records, '本轮新生成的 Qwen Vivian 女声')
        path = directory / 'index.html'
        page = path.read_text().replace('中文女声试听', '清脆温柔女声试听')
        page = page.replace('<h2>参考原声</h2>', '<h2>合成参考女声 · Qwen Vivian</h2>')
        page = page.replace('下方是 AI 合成试听，可与这段原声对比。',
                            '这段声音由 Qwen 新生成，供 CosyVoice 和 IndexTTS 参考。')
        path.write_text(page)

    def done(key, seconds):
        audio = directory / f'{key}.wav'
        if not valid_audio(audio):
            raise RuntimeError(f'{key} 未生成有效音频')
        records[key] = {'status': '已生成', 'duration': sf.info(audio).duration, 'seconds': seconds}
        refresh()

    reference = directory / 'reference.wav'
    refresh()
    samples = [{'text': TEXT, 'voice': key.capitalize(), 'output': str(directory / f'{key}.wav')}
               for key in ('serena', 'vivian') if records[key]['status'] != '已生成']
    if not valid_audio(reference):
        samples.append({'text': REFERENCE_TEXT, 'voice': 'Vivian', 'output': str(reference)})
    if samples:
        model = prepare_qwen()
        worker('qwen', {'model_path': str(model), 'instruct': STYLE, 'samples': samples}, directory)
        for key in ('serena', 'vivian'):
            timing = json.loads((directory / f'{key}.timing.json').read_text())
            done(key, timing['generation_seconds'])
    (directory / 'reference.txt').write_text(REFERENCE_TEXT)
    failures = []
    for key in ('cosy', 'index'):
        if records[key]['status'] == '已生成':
            continue
        start = time.monotonic()
        records[key] = {'status': '正在生成'}
        refresh()
        try:
            target = directory / f'{key}.wav'
            if key == 'cosy':
                engine, weights = prepare_cosy()
                worker('cosy', {'engine_path': str(engine), 'model_path': str(weights),
                       'text': TEXT, 'ref_audio': str(reference), 'ref_text': REFERENCE_TEXT,
                       'instruction': STYLE, 'speed': .95, 'sentence_pause': .2,
                       'diffusion_steps': 32, 'output': str(target)},
                       directory, engine / '.venv/bin/python', engine)
            else:
                engine, weights = prepare_index()
                execute([engine / '.venv/bin/mlx-indextts', 'generate', '--model', weights,
                         '--profile', 'v25', '--language', 'zh', '--ref-audio', reference,
                         '--no-denoise-ref', '--text', TEXT, '--seed', '0',
                         '--diffusion-steps', '32', '--max-text-tokens', '30',
                         '--max-tokens', '256', '--output', target], directory / 'index.log', engine)
            done(key, round(time.monotonic() - start, 2))
        except Exception as error:
            failures.append(key)
            records[key] = {'status': '生成失败', 'error': str(error)}
            refresh()
    refresh()
    print(f'试听页：http://127.0.0.1:4318/{run_id}/index.html', flush=True)
    return bool(failures)


if __name__ == '__main__':
    os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
    os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
    with (ROOT / '.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit('已有试听脚本在运行，请等待它完成。')
        sys.exit(main())
