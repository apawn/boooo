# 离线朗读

本目录包含 Kokoro v1.1 Mandarin/English 的量化模型、发音词典及音色归档，由 Git LFS 管理。首次克隆请运行 `git lfs pull`，然后在 `__pages` 下运行 `npm ci` 和 `npm start`。启动脚本会校验并解压首次使用的模型。安装完成后，朗读可离线使用。

普通话使用 zf_004 女声（0.91 倍），英语使用美式 Sol 女声（0.76 倍）。英语通过随应用安装的 eSpeak NG 发音模块生成音素，由 Kokoro 合成声音。模型由本地 Node 服务通过 sherpa-onnx 在 CPU 上运行。选区文字仅传给本地阅读服务。归档保留上游分发的许可证及资源，模型许可为 Apache 2.0。

[模型说明](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) · [上游量化归档](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2)
