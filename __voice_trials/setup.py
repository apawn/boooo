"""Install each engine into its own environment; download only selected models."""
from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
ENGINES = ROOT / '.engines'
UV = ROOT / '.venv/bin/uv'
QWEN = 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit'
QWEN_REV = '41d3337e8b7f2843a75841595fc14e4b9a7a4b96'
INDEX_REV = 'd0aa86e75bb6f3437f3831e95056fa72842d89ef'
COSY_REV = '29e01c4e8d000f4bcd70751be16fa94bf3d85a18'


def run(argv, cwd=ROOT):
    subprocess.run([str(arg) for arg in argv], cwd=cwd, check=True)


def download(repo, revision, directory, **patterns):
    from huggingface_hub import snapshot_download
    stamp = directory / '.trial-revision'
    if stamp.exists() and stamp.read_text() == revision:
        return directory
    print(f'下载 {repo}，首次运行需要等待，重试会续传。', flush=True)
    snapshot_download(repo, revision=revision, local_dir=directory, max_workers=3, **patterns)
    stamp.write_text(revision)
    return directory


def engine_source(name, url, revision):
    directory = ENGINES / name
    if not (directory / '.git').exists():
        run(['git', 'clone', url, directory])
        run(['git', 'checkout', revision], directory)
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=directory, text=True).strip()
    if actual != revision:
        raise RuntimeError(f'{directory} 的版本与试听脚本不一致，请使用固定版本 {revision}')
    return directory


def prepare_qwen():
    return download(QWEN, QWEN_REV, ENGINES / 'qwen-model',
                    allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model', '*.tiktoken'])


def prepare_index():
    source = engine_source('index', 'https://github.com/groxaxo/mlx-indextts2-inference.git',
                           'a6d8fef49b3c36fa8bccaf5a780091e9b864f8e7')
    python = source / '.venv/bin/python'
    if not python.exists():
        run([UV, 'venv', '--python', sys.executable, source / '.venv'])
    if not (source / '.trial-installed').exists():
        run([UV, 'pip', 'install', '--python', python, str(source) + '[v25]'])
        (source / '.trial-installed').touch()
    model = source / 'models/mlx-IndexTTS-2.5-8bit'
    if not (model / 'model_manifest.json').exists():
        original = download('IndexTeam/IndexTTS-2.5', INDEX_REV,
                            source / 'models/IndexTTS-2.5-source',
                            ignore_patterns=['qwen0.6bemo4-merge/*'])
        run([source / '.venv/bin/mlx-indextts', 'convert', '--model-dir', original,
             '--output', model, '--dtype', 'float16', '--quantize', '8',
             '--source-revision', INDEX_REV, '--resume'], source)
    return source, model


def prepare_cosy(rl=False):
    source = engine_source('cosy', 'https://github.com/ZoneTwelve/CosyVoice-MPS.git',
                           '9060a7a641c62ac47ce179191c7cd4aea4af919a')
    python = source / '.venv/bin/python'
    if not (source / '.trial-installed-v3').exists():
        run(['git', 'submodule', 'update', '--init', '--recursive'], source)
        if not python.exists():
            run([UV, 'venv', '--python', '3.10', source / '.venv'])
        run([UV, 'pip', 'install', '--python', python, 'setuptools==69.5.1', 'wheel'])
        # Upstream lists CUDA package indexes. macOS wheels come from PyPI.
        requirements = source / 'requirements-mac.txt'
        # New WeText bundles normalization data instead of downloading it from ModelScope.
        # Pin the gRPC version whose universal macOS binaries we validate.
        requirements.write_text('\n'.join(line.replace('wetext==0.0.4', 'wetext==0.2.1')
                                           .replace('grpcio==1.57.0', 'grpcio==1.62.3')
                                           .replace('grpcio-tools==1.57.0', 'grpcio-tools==1.62.3')
                                           for line in (source / 'requirements.txt').read_text().splitlines()
                                           if not line.startswith('--extra-index-url')) + '\n')
        run([UV, 'pip', 'install', '--python', python, '--no-build-isolation-package',
             'openai-whisper', '-r', requirements])
        (source / '.trial-installed-v3').touch()
    model = download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', COSY_REV,
                     source / 'pretrained_models/Fun-CosyVoice3-0.5B',
                     ignore_patterns=['llm.rl.pt', 'speech_tokenizer_v3.batch.onnx',
                                      'flow.decoder.estimator.fp32.onnx', 'asset/*'])
    if rl:
        from huggingface_hub import hf_hub_download
        hf_hub_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', 'llm.rl.pt',
                        revision=COSY_REV, local_dir=model)
    return source, model
