# 离线朗读

英语使用 Kokoro v1.0 的美式 Heart 女声（0.76 倍），保留完整精度的模型。普通话使用 Matcha Baker 单人女声（0.91 倍），由 Vocos 合成波形。中英文均在本地 CPU 上合成。

首次克隆请运行 `git lfs pull`，在 `__pages` 下运行 `npm ci` 和 `npm start`。英文模型归档随仓库由 Git LFS 分发。首次启动还会从 sherpa-onnx 的发布页下载普通话声学模型和声码器，校验 SHA-256 后存入 `speech/models/`。安装完成后可离线运行。上游注明 Baker 训练数据仅限非商业用途。

服务启动时提前载入模型。选区开头先合成一个短片段，再继续向下朗读。已生成的片段最多在服务内存中缓存 16 MiB，重启后清空。

[英文模型与音色](https://huggingface.co/hexgrad/Kokoro-82M) · [普通话模型与试听](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese/matcha-icefall-zh-baker.html) · [Baker 模型说明](https://huggingface.co/csukuangfj/matcha-icefall-zh-baker)
