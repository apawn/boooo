# 本地朗读

中文只使用 Qwen3-TTS Serena，保留试听选定的温柔普通话风格和 1.24 倍语速，变速时保持音高。阅读页「中文音色」可试听；已有的其他音色选择会自动迁移至 Serena。英文沿用 Kokoro v1.0 的美式 Heart 女声（0.76 倍）。

`profiles.json` 记录合成配置，`previews/serena.wav` 保存选定版本的试听音频，正文使用相同配置实时生成。

## 启动

当前中文后端需要 Apple Silicon Mac。首次克隆先运行 `git lfs pull`，在 `__pages` 下执行 `npm ci`、`npm start`。首次安装需要联网下载 Python 环境和模型；完成后朗读可离线使用。只准备中文模型可运行 `npm run setup:chinese`。

中文模型与试听工具共用仓库 `__voice_trials` 目录中的 `.venv` 和 `.engines/qwen-model`，避免重复下载。该目录下的脚本需要随项目保留；环境、模型和试听输出已被 Git 忽略。可通过 `BOOKSHELF_VOICE_HOME` 指定另一套兼容的完整运行目录。书架只准备和加载 Qwen，不会安装或加载 CosyVoice、IndexTTS。独立试听工具保留。

Qwen 使用固定版本的 `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`，版本记录在 `__voice_trials/setup.py`。英文模型归档继续通过 Git LFS 分发。

## 播放

服务启动时预加载模型，中文 Python 进程持续复用模型。短句按请求排队生成，浏览器预取下一句；生成后的 WAV 按语言、音色和文字缓存，最多占用 16 MiB，重启清空。停止服务时同时结束模型进程。

保留暂停、继续、段落播放和当前行波浪线。

Serena 的保音高变速函数取自 MIT 许可的 mlx-indextts，许可见 `third-party/WSOLA-LICENSE.txt`；不需要安装 IndexTTS。
