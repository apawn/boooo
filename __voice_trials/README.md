# 中文女声试听

2026-11-07 磁盘清理：本机仅保留书架正在使用的 `.engines/qwen-model`（Serena）和 `.engines/qwen-base-8bit`（选定英语女声）。CosyVoice、IndexTTS、Fish、Qwen VoiceDesign 的模型和专用环境已删除，试听音频及脚本保留。再次运行对应试听脚本会重新下载所需模型；正常启动书架只准备当前两套模型。

英语朗读升级的候选模型、Higgs 下载体积与换电脑试听步骤见 [英语朗读模型试听计划](english-tts-research.md)。该计划尚未接入下面的中文试听脚本。

## 英语 VoiceDesign 独立试听

已有本目录的 Apple Silicon Python 环境时，可运行：

```bash
__voice_trials/.venv/bin/python __voice_trials/english_voice_design.py
```

脚本会下载独立的 Qwen3-TTS VoiceDesign 8-bit 模型（约 3.08 GB），生成同一段英语的“温柔讲述”和“清晰讲解”两种声音。文字与声音描述可在脚本中修改；使用模型原始语速，未做后期变速。音频、参数、耗时及试听 HTML 位于 `output/english-design-*/`。复用现有 4318 试听服务即可访问，或用 `python3 -m http.server 4318 --bind 127.0.0.1 --directory __voice_trials/output` 启动。该脚本不会修改书架的声音设置。

## 英语 Fish S2-Pro 独立试听

```bash
__voice_trials/.venv/bin/python __voice_trials/english_fish.py
__voice_trials/.venv/bin/python __voice_trials/english_fish.py --voice bright
__voice_trials/.venv/bin/python __voice_trials/english_fish.py --voice composed
```

使用固定版本的 `mlx-community/fish-audio-s2-pro-8bit`，权重与音频编解码模型共约 6.7 GB。脚本先通过 Qwen VoiceDesign 生成一段独立的英音女声参考，再用 Fish 生成与 Qwen 试听相同的英语正文。两个版本分别为自然讲述、加入少量语气标签的讲述；保留原始语速。参考声音、正文音频、参数、耗时和试听页在 `output/english-fish-*/`。参考由 AI 合成，最终口音与音质需试听确认。此脚本不修改书架配置。Fish S2-Pro 权重采用 [Fish Audio Research License](https://huggingface.co/fishaudio/s2-pro)，与 Qwen 的许可不同。

默认 `gentle` 为温柔标准英音，`--voice bright` 为明亮清晰英音，`--voice composed` 为沉静成熟英音。不同音色使用不同的 Qwen 合成参考声音；仅默认温柔音色额外生成语气标签版。完成后统一对比页为 `output/english-fish-comparison/index.html`，在 4318 服务中访问 `/english-fish-comparison/index.html`。

## 中文试听使用方式

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
