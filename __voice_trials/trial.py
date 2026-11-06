#!/usr/bin/env python3
"""Local Chinese voice comparison, independent of the bookshelf reader."""
import argparse
from functools import partial
import fcntl
import hashlib
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import time
import webbrowser

from setup import ROOT, prepare_qwen, prepare_cosy, prepare_index

STYLE = '标准普通话，清澈温柔的年轻女声，吐字清晰，语速舒缓，停顿自然，像安静地为人读书，情绪温暖而克制。'
REFERENCE_TEXT = '你好，很高兴在这里陪你读书。让我们放慢脚步，听一听窗外的风声，也给自己留一点安静的时间。'
OUTPUT = ROOT / 'output'
NAMES = {'serena': 'Qwen3-TTS · Serena', 'vivian': 'Qwen3-TTS · Vivian',
         'cosy': 'CosyVoice 3', 'index': 'IndexTTS 2.5'}


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


def execute(argv, log, cwd=ROOT):
    print(f'正在运行，详细日志 → {log}', flush=True)
    with log.open('w') as stream:
        result = subprocess.run([str(x) for x in argv], cwd=cwd, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(log.read_text(errors='replace')[-1800:])


def worker(engine, job, directory, python=sys.executable, cwd=ROOT):
    path = directory / f'{engine}-job.json'
    write_json(path, job)
    execute([python, ROOT / 'worker.py', engine, path], directory / f'{engine}.log', cwd)


def qwen_samples(model, samples, directory):
    if samples:
        worker('qwen', {'model_path': str(model), 'instruct': STYLE, 'samples': samples}, directory)


def sample(text, voice, output):
    return {'text': text, 'voice': voice, 'output': str(output)}


def valid_audio(path):
    if not path.exists():
        return False
    import soundfile as sf
    import numpy as np
    try:
        audio, rate = sf.read(path)
        return rate >= 16000 and len(audio) > rate and np.isfinite(audio).all() and np.max(np.abs(audio)) > .001
    except (RuntimeError, ValueError):
        return False


def report(directory, text, records, reference):
    cards = []
    for key, record in records.items():
        title = html.escape(NAMES[key])
        description = '内置中文女声 · 温柔朗读指令' if key in ('serena', 'vivian') else '参考女声 · ' + html.escape(reference)
        if record.get('description'):
            description = html.escape(record['description'])
        body = '<p class="status">' + html.escape(record['status']) + '</p>'
        if record['status'] == '已生成':
            body = f'<audio controls preload="metadata" src="{key}.wav"></audio>'
            body += '<p class="meta">音频 {:.1f} 秒 · 本次运行 {:.1f} 秒</p>'.format(record['duration'], record['seconds'])
            body += f'<button data-choice="{key}">选择这个声音</button> <a href="{key}.wav" download>下载音频</a>'
        if record.get('error'):
            body += '<details><summary>错误详情</summary><pre>' + html.escape(record['error']) + '</pre></details>'
        if record.get('note'):
            body += '<p class="meta">' + html.escape(record['note']) + '</p>'
        cards.append(f'<section><h2>{title}</h2><p class="meta">{description}</p>{body}</section>')
    page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>中文女声试听</title><style>
body{background:#f7f4ec;color:#353c32;font:17px/1.7 system-ui,sans-serif;max-width:1040px;margin:auto;padding:40px 24px}
h1{font-size:30px;font-weight:600;margin-bottom:10px}h2{font-size:21px;margin:0 0 6px}.text{padding:20px;background:#fffdf7;border-left:3px solid #b5c4a2}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:24px}section{padding:24px;background:#fffdf7;border:1px solid #dedbce;border-radius:14px}
.meta{color:#697064;font-size:14px}audio{width:100%;margin-top:10px}button{background:#526749;color:white;border:0;border-radius:7px;padding:9px 15px;cursor:pointer;font:inherit}
a{color:#526749;font-size:14px;margin-left:12px}pre{white-space:pre-wrap;font-size:12px;overflow-wrap:anywhere}#choice{min-height:30px;font-weight:600}section.selected{outline:2px solid #6c815d}
</style><h1>中文女声试听</h1><p>比较咬字、停顿、清澈度，以及连续听下来是否舒服。选择后把名字告诉我。</p>
REFERENCE_PLAYER<p class="text">TEXT</p><div class="grid">CARDS</div><p id="choice" aria-live="polite"></p>
<p class="meta">全部在本机生成。耗时包含启动与模型加载，首次运行还可能包含下载，不能直接当作播放延迟。参考音色来自 REFERENCE。</p>
<script>
const key='voice-trial:'+location.pathname;
function select(value){document.querySelectorAll('section').forEach(s=>s.classList.remove('selected'));
const button=[...document.querySelectorAll('[data-choice]')].find(b=>b.dataset.choice===value);
if(button){button.closest('section').classList.add('selected');document.querySelector('#choice').textContent='已选 '+button.closest('section').querySelector('h2').textContent;}}
document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{if(a!==b)b.pause();})));
document.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{select(b.dataset.choice);try{localStorage.setItem(key,b.dataset.choice)}catch{}}));
try{select(localStorage.getItem(key))}catch{}
</script></html>'''
    reference_player = ('<section><h2>参考原声</h2><p class="meta">下方是 AI 合成试听，可与这段原声对比。</p>'
                        '<audio controls preload="metadata" src="reference.wav"></audio></section>') if (directory / 'reference.wav').exists() else ''
    page = page.replace('REFERENCE_PLAYER', reference_player).replace('TEXT', html.escape(text)).replace('CARDS', ''.join(cards)).replace('REFERENCE', html.escape(reference))
    (directory / 'index.html').write_text(page)
    write_json(directory / 'results.json', {'text': text, 'reference': reference, 'voices': records})
    latest = '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + directory.name + '/index.html">'
    (OUTPUT / 'index.html').write_text(latest)


def main(lock):
    parser = argparse.ArgumentParser(description='独立的本地中文女声试听。首次运行会下载模型。')
    parser.add_argument('--model', choices=['all', 'qwen', 'cosy', 'index'], default='all')
    parser.add_argument('--text-file', type=Path, default=ROOT / 'sample.txt')
    parser.add_argument('--reference', type=Path, help='可选的干净女声 WAV，建议 10–20 秒，最多 30 秒')
    parser.add_argument('--reference-text', help='参考音频的准确文字，CosyVoice 必需')
    parser.add_argument('--cosy-speed', type=float, default=1.0, help='CosyVoice 合成语速，默认 1.0')
    parser.add_argument('--cosy-sentence-pause', type=float, default=0.0,
                        help='大于 0 时按完整句子生成，并插入指定秒数的停顿')
    parser.add_argument('--cosy-instruction', default='', help='使用指令模式调整口音和朗读方式，仍以参考录音提供音色')
    parser.add_argument('--cosy-continuous', action='store_true', help='将试听段落连续生成，避免自动拆成很短的片段')
    parser.add_argument('--cosy-diffusion-steps', type=int, choices=[10, 20, 32], default=10,
                        help='实验性声学解码步数，默认 10；更多步数需试听确认效果')
    parser.add_argument('--cosy-seed', type=int, default=42, help='CosyVoice 随机种子')
    parser.add_argument('--cosy-rl', action='store_true', help='使用官方 RL 语言模型权重，首次另行下载')
    parser.add_argument('--cosy-pronunciations', type=Path, help='词语到 CosyVoice 拼音标记的 JSON 字典，需连续生成')
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--serve', action='store_true', help='生成后在本机启动试听网页')
    parser.add_argument('--port', type=int, default=4318)
    args = parser.parse_args()
    if not .5 <= args.cosy_speed <= 1.5 or not 0 <= args.cosy_sentence_pause <= 2:
        parser.error('CosyVoice 语速需在 0.5–1.5，句间停顿需在 0–2 秒。')
    if args.cosy_continuous and args.cosy_sentence_pause:
        parser.error('连续生成不能同时使用分句停顿。')
    if not 0 <= args.cosy_seed < 2 ** 32:
        parser.error('随机种子需在 0–4294967295。')
    pronunciations = json.loads(args.cosy_pronunciations.read_text()) if args.cosy_pronunciations else {}
    if args.cosy_pronunciations and (not args.cosy_continuous or not isinstance(pronunciations, dict)
            or not all(isinstance(k, str) and k and isinstance(v, str) and v for k, v in pronunciations.items())):
        parser.error('发音字典需为非空词语到发音字符串的 JSON 映射，并使用 --cosy-continuous。')
    text = args.text_file.read_text().strip()
    if not text or len(text) > 500:
        parser.error('试听文字需为 1–500 个字符。请缩短后再试。')
    if args.reference and (not args.reference_text or not valid_audio(args.reference)):
        parser.error('自选参考音频需为有效音频，并提供 --reference-text 准确文字。')
    if args.reference:
        import soundfile as sf
        if sf.info(args.reference).duration > 30:
            parser.error('参考音频不能超过 30 秒，请裁剪为 10–20 秒的干净人声。')
    ref_text = args.reference_text if args.reference else REFERENCE_TEXT
    identity = {'version': 3, 'text': text, 'style': STYLE, 'reference_text': ref_text,
                'reference_sha256': hashlib.sha256(args.reference.read_bytes()).hexdigest() if args.reference else 'qwen-serena'}
    if (args.cosy_speed != 1.0 or args.cosy_sentence_pause or args.cosy_instruction
            or args.cosy_continuous or args.cosy_diffusion_steps != 10 or args.cosy_seed != 42 or args.cosy_rl):
        identity['cosy_options'] = {'speed': args.cosy_speed, 'sentence_pause': args.cosy_sentence_pause}
        if args.cosy_instruction:
            identity['cosy_options']['instruction'] = args.cosy_instruction
        if args.cosy_continuous:
            identity['cosy_options']['continuous'] = True
        if args.cosy_diffusion_steps != 10:
            identity['cosy_options']['diffusion_steps'] = args.cosy_diffusion_steps
        if args.cosy_seed != 42:
            identity['cosy_options']['seed'] = args.cosy_seed
        if args.cosy_rl:
            identity['cosy_options']['rl'] = True
        if pronunciations:
            identity['cosy_options']['pronunciations'] = pronunciations
    run_id = hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()[:12]
    directory = OUTPUT / run_id
    directory.mkdir(parents=True, exist_ok=True)
    write_json(directory / 'settings.json', identity)
    (directory / 'text.txt').write_text(text)
    ref_name = args.reference.name if args.reference else 'Qwen Serena 合成的独立短句'
    reference = args.reference.resolve() if args.reference else OUTPUT / 'reference-serena.wav'
    if args.reference and reference != directory / 'reference.wav':
        shutil.copyfile(reference, directory / 'reference.wav')
    records_file = directory / 'results.json'
    records = json.loads(records_file.read_text())['voices'] if records_file.exists() else {}
    chosen = ['serena', 'vivian', 'cosy', 'index'] if args.model == 'all' else (['serena', 'vivian'] if args.model == 'qwen' else [args.model])
    for key in chosen:
        if not valid_audio(directory / f'{key}.wav'):
            records[key] = {'status': '待生成'}
    report(directory, text, records, ref_name)
    model = None
    failures = []
    for key in chosen:
        target = directory / f'{key}.wav'
        if records[key]['status'] == '已生成' and valid_audio(target):
            print(NAMES[key] + ' 已有相同参数的试听，直接复用。', flush=True)
            continue
        start = time.monotonic()
        try:
            print('开始 ' + NAMES[key], flush=True)
            records[key] = {'status': '正在准备和生成'}
            report(directory, text, records, ref_name)
            if key in ('serena', 'vivian') or not valid_audio(reference):
                model = model or prepare_qwen()
            if key in ('serena', 'vivian'):
                qwen_samples(model, [sample(text, key.capitalize(), target)], directory)
            else:
                if not valid_audio(reference):
                    qwen_samples(model, [sample(REFERENCE_TEXT, 'Serena', reference)], directory)
                    reference.with_suffix('.txt').write_text(REFERENCE_TEXT)
                if key == 'cosy':
                    engine, weights = prepare_cosy(rl=args.cosy_rl)
                    worker('cosy', {'engine_path': str(engine), 'model_path': str(weights),
                           'text': text, 'ref_audio': str(reference), 'ref_text': ref_text,
                           'speed': args.cosy_speed, 'sentence_pause': args.cosy_sentence_pause,
                           'instruction': args.cosy_instruction,
                           'continuous': args.cosy_continuous, 'diffusion_steps': args.cosy_diffusion_steps,
                           'seed': args.cosy_seed,
                           'rl': args.cosy_rl,
                           'pronunciations': pronunciations,
                           'output': str(target)}, directory, engine / '.venv/bin/python', engine)
                else:
                    engine, weights = prepare_index()
                    execute([engine / '.venv/bin/mlx-indextts', 'generate', '--model', weights,
                             '--profile', 'v25', '--language', 'zh', '--ref-audio', reference,
                             '--no-denoise-ref',
                             '--text', text, '--seed', '0', '--duration-factor', '1.0',
                             '--diffusion-steps', '32', '--max-text-tokens', '30', '--max-tokens', '256',
                             '--output', target], directory / 'index.log', engine)
            if not valid_audio(target):
                raise RuntimeError('音频为空、太短或包含无效数值，请查看日志。')
            import soundfile as sf
            records[key] = {'status': '已生成', 'seconds': round(time.monotonic() - start, 2),
                            'duration': sf.info(target).duration}
        except Exception as error:
            failures.append(key)
            records[key] = {'status': '生成失败，可重新运行重试', 'error': str(error)}
            print(NAMES[key] + ' 失败\n' + str(error), file=sys.stderr, flush=True)
        report(directory, text, records, ref_name)
    print('试听页面 → ' + str(directory / 'index.html'), flush=True)
    if args.serve:
        fcntl.flock(lock, fcntl.LOCK_UN)
        handler = partial(SimpleHTTPRequestHandler, directory=str(OUTPUT))
        with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
            url = f'http://127.0.0.1:{args.port}/{run_id}/index.html'
            print(url + '（按 Ctrl+C 结束）', flush=True)
            if not args.no_open:
                webbrowser.open(url)
            server.serve_forever()
    elif not args.no_open:
        webbrowser.open((directory / 'index.html').as_uri())
    return bool(failures)


if __name__ == '__main__':
    os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
    os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
    # One installation/inference process at a time prevents partial shared outputs.
    with (ROOT / '.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit('已有试听脚本在运行。请等待它结束后再重试。')
        sys.exit(main(lock))
