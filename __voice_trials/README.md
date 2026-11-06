# 中文女声试听

在 Apple Silicon Mac 上独立运行三套模型，生成同一段中文的四种朗读。

- Qwen3-TTS 1.7B，Serena 和 Vivian，8-bit MLX。
- CosyVoice 3 0.5B，使用社区 MPS 运行版本。
- IndexTTS 2.5，使用社区 MLX 运行版本，GPT 为 8-bit。

双击 `试听.command` 即可。首次下载和安装较慢，建议预留 30 GB 空间。再次运行会复用已有模型及相同参数的音频。所有模型在本机合成，下载后可复用本地文件。

命令行运行也可以，路径随项目位置调整。

```bash
cd /path/to/boooo
./__voice_trials/试听.command
```

可编辑 `sample.txt` 更换试听文字，或指定一个 UTF-8 文本文件。每次最多 500 个字符。

生成独立的“清脆、年轻、温柔”四声对比，可运行 `./__voice_trials/试听.command --bright`。这组使用 `bright_voices.py` 中的统一试听文字：Qwen 使用 Serena/Vivian 预设，CosyVoice 与 IndexTTS 使用本轮新合成的 Vivian 短句作音色参考。

```bash
./__voice_trials/试听.command --model qwen --text-file /绝对路径/试听文字.txt
./__voice_trials/试听.command --model cosy
./__voice_trials/试听.command --model index
```

如果 CosyVoice 连读不清，可尝试稍慢的语速、逐句生成和句间停顿；这会改变节奏，具体效果需要试听。

```bash
./__voice_trials/试听.command --model cosy --cosy-speed 0.88 --cosy-sentence-pause 0.35
```

口音或卷舌不自然时，可以切换为指令模式，尝试用标准普通话朗读。这个模式仍使用参考音色，但与原声的相似度也需要重新试听。

```bash
./__voice_trials/试听.command --model cosy --cosy-sentence-pause 0.3 \
  --cosy-instruction '请用标准普通话自然朗读，咬字清晰，发音准确，语气温柔平和。'
```

优先保留原声说话习惯时，可使用原声和准确转写连续生成完整试听段落。可比较默认的 10 步与实验性的 32 步声学解码；更多步数会更慢，不保证更好。CosyVoice 新生成音频保存为 24-bit WAV。

```bash
./__voice_trials/试听.command --model cosy --reference /绝对路径/女声.wav \
  --reference-text '参考录音的准确文字' --cosy-continuous --cosy-diffusion-steps 32
```

加上 `--cosy-rl` 可对比官方 RL 权重，首次会另行下载 `llm.rl.pt`。该选项与原模型分别缓存试听结果，是否更准确、更像原声需要分别核对。

少数词语可通过 `--cosy-pronunciations /绝对路径/发音字典.json` 指定官方支持的拼音标记，例如 `{"书页":"[sh][ū][y][è]"}`。需同时使用 `--cosy-continuous`；页面仍展示原文字，发音映射会记录到参数文件中。

CosyVoice 和 IndexTTS 默认共用 Qwen Serena 合成的独立参考短句。这个比较展示的是两套模型模仿该音色的效果。用别的参考声音会得到不同音色。

可用自选的干净女声录音替换，建议 10–20 秒（最多 30 秒），只有一人说话，没有背景音乐，并填写准确的对应文字。自选样本用于 CosyVoice 和 IndexTTS；Qwen 的两个选项仍使用内置女声。

```bash
./__voice_trials/试听.command --model all \
  --reference /绝对路径/女声.wav \
  --reference-text '这段录音实际说出的完整文字'
```

输出在 `output/<参数编号>/`，包含 WAV、试听网页、参数、结果和日志。网页上的“选择这个声音”会在当前浏览器保存选择。生成失败时页面显示错误，同一命令可重试。生成后默认在浏览器打开网页，也可以启动本地网页服务。

```bash
./__voice_trials/试听.command --serve --port 4318
```

模型和运行环境放在 `.engines/` 与 `.venv/`，额外依赖可能使用 Hugging Face、uv 的用户缓存。Git 忽略这些环境、模型、输出音频。脚本只负责试听，选好之后再把选定声音接入阅读器。

模型与运行版本固定在 `setup.py` 中。生成耗时包括启动与加载，首次运行可能包括下载，适合记录等待时间，不能直接解释为连续朗读时的延迟。

CosyVoice 部分运算会回退到 CPU，生成速度可能较慢。其 gRPC 通用二进制可在 Apple Silicon 导入，但 wheel 内的架构标签会使 `uv pip check` 报平台警告；这与实际运行检查分开记录。

上游来源为 [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)、[MLX Audio](https://github.com/Blaizzy/mlx-audio)、[CosyVoice MPS](https://github.com/ZoneTwelve/CosyVoice-MPS) 和 [IndexTTS MLX](https://github.com/groxaxo/mlx-indextts2-inference)。
