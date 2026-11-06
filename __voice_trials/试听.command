#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  candidates=(python3.12 python3.11 python3.10 python3 "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3")
  for candidate in "${candidates[@]}"; do
    if "$candidate" -c 'import sys; assert sys.version_info >= (3, 10)' 2>/dev/null; then
      "$candidate" -m venv .venv
      break
    fi
  done
fi
if [[ ! -x .venv/bin/python ]]; then
  echo '请先安装 Python 3.10 或更新版本，再运行此脚本。'
  exit 1
fi
if ! cmp -s requirements.txt .venv/trial-requirements.txt; then
  .venv/bin/python -m pip install --no-cache-dir -r requirements.txt
  cp requirements.txt .venv/trial-requirements.txt
fi
if [[ "${1:-}" == "--bright" ]]; then
  exec .venv/bin/python bright_voices.py
fi
exec .venv/bin/python trial.py "$@"
