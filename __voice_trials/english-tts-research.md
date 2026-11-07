# 英语朗读模型试听计划

整理日期：2026-11-07。供换电脑后继续试听。已生成 Qwen VoiceDesign 8-bit 的两段本地试听，Higgs 和 Chatterbox 尚未实测；没有替换书架的英语声音。

本机 Qwen 试听：运行 `__voice_trials/.venv/bin/python __voice_trials/english_voice_design.py`。当前结果在 `__voice_trials/output/english-design-f202d489400e/`：温柔讲述版 45.68 秒，合成约 18.81 秒；清晰讲解版 38.48 秒，合成约 14.31 秒。合成时间不包含下载及模型加载，音质和口音仍待用户选择。输出与模型不进入 Git，换电脑需重新生成。

本机 Fish S2-Pro 试听也已完成：脚本 `__voice_trials/english_fish.py`，固定 MLX 8-bit 版本，模型及编解码权重约 6.7 GB。三种合成英音女声参考分别为温柔、明亮、成熟，温柔版另外生成语气标签对照，共四段，每段约 34–35 秒，合成约 28–36 秒（不含下载与加载）。使用 Qwen VoiceDesign 新合成的参考音色，正文由 Fish 生成，未做后期变速。自动转写核对未发现漏词、重复或标签被读出；该检查不代表口音或自然度已获验证。统一试听页为 `http://127.0.0.1:4318/english-fish-comparison/index.html`，输出文件仍仅在本机，书架声音未替换。

最终选择（2026-11-07）：用户选定 `english-design-f202d489400e/teacher.wav`。书架已改为使用该 Qwen 合成女声作为固定参考，由 Qwen3-TTS Base 8-bit 生成新正文，原始试听与参考片段保存到 `__pages/speech/`。英文保持原始语速，优先整句合成。安装与运行说明见 `__pages/speech/README.md`；前述“尚未替换”描述的是试听阶段。

## 想要的效果

清澈、温柔的成年女声，标准英式英语。朗读要有自然的句子重音、弱读、连读和语调变化，按意思分组停顿，有轻微语速起伏；避免逐字匀速读，也不要夸张表演。

雅思听力包含英、美、澳、新西兰等多种口音，并没有唯一的“雅思口音”。本次先以清晰的标准英音（contemporary RP / Standard Southern British English）为试听目标。[雅思官方说明](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening)

## 当前书架实现

- 英文：Kokoro v1.0 ONNX，Heart 美音女声，生成速度参数为 `0.76`，使用美音词典。
- 入口：`__pages/speech/engine.mjs`；切句与播放逻辑：`__pages/read-aloud.js`。
- 当前会把部分句子拆成短片段分别生成。统一减速和片段之间缺乏上下文，可能影响节奏；这是待验证的原因，不是已证实的结论。
- 中文继续使用 Qwen3-TTS Serena，与这次英文试听分开。

## 候选模型

| 模型 | 试听理由 | 注意事项 |
| --- | --- | --- |
| Qwen3-TTS 1.7B VoiceDesign | 支持用自然语言控制音色、情绪和韵律，可以尝试设计温柔英音女声；已有 Qwen 本地环境经验 | 与现有 Serena 的 CustomVoice 是不同检查点，需要另行下载。英音准确性和跨段音色稳定性须实测；提示词不是保证 |
| Higgs TTS 3 · 4B | 面向有表现力的自然语音，支持情绪、风格、韵律和停顿控制 | 模型较大，本机速度和内存峰值未知；采用研究及非商业许可，正式接入前按用途核对许可 |
| Chatterbox | 支持表达强度与节奏调节，可作为英语对照样本 | 官方宣布于 2026 年 8 月停止维护，列为备选；英音效果依赖所选模型和参考声音 |

优先试听 Qwen VoiceDesign 和 Higgs TTS 3。以上顺序根据能力及接入成本安排，不代表已经听过并确定音质排名。

官方资料：

- [Qwen VoiceDesign 模型](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign)、[代码和使用说明](https://github.com/QwenLM/Qwen3-TTS)。支持自然语言声音控制，Apache 2.0 许可。
- [Higgs TTS 3 模型与使用说明](https://huggingface.co/bosonai/higgs-tts-3-4b)、[官方仓库](https://github.com/boson-ai/higgs-audio)。注意使用 v3 的说明，勿误用旧版 v2 安装流程。
- [Chatterbox 仓库与维护状态](https://github.com/resemble-ai/chatterbox)。代码为 MIT 许可。
- [MLX Audio](https://github.com/Neywa-Labs/mlx-audio)：Apple Silicon 本地推理的候选运行库；具体模型适配与版本需在新电脑核对。

## Higgs TTS 3 的下载大小

截至整理日期，[官方文件列表](https://huggingface.co/bosonai/higgs-tts-3-4b/tree/main)显示：

| 项目 | 大小 |
| --- | --- |
| 官方模型仓库 | 约 9.32 GB |
| `model.safetensors` 权重 | 约 9.31 GB |
| 参数规模 | 名称中的 4B 指约 40 亿参数，不是 4 GB |

9.32 GB 不等于完整安装占用，也不等于运行内存。还要考虑运行环境、音频编解码组件和缓存。先预留 15–20 GB 磁盘空间是初步估算，可能因后端及缓存方式而增加；运行内存峰值尚未实测，不承诺某个内存配置一定可用。

社区有量化版本，但本轮未确认具体版本的文件体积、兼容性及音质。正式试听时记录准确模型 ID、版本和量化精度，不直接把原版结果套用到量化版。

## 换电脑后怎么继续

1. 获取包含本文档的项目版本；先查看新电脑的操作系统、芯片/GPU、内存和磁盘余量。
2. Apple Silicon 优先核对 MLX Audio 的对应模型适配；NVIDIA 电脑按模型官方当前说明选择后端。现有 `试听.command` 主要面向 Apple Silicon 中文试听，尚不能直接运行这份英语计划。
3. 创建独立英语试听环境，先安装一个模型。模型、环境和生成音频继续放在 Git 忽略的本地目录；不要将大权重加入仓库。
4. 先生成同一段 30–60 秒英文，再试听含问句、对话和长句的段落。不要一开始就接入书架。
5. 加一份现有 Kokoro Heart 作为对照，分别比较自然生成和统一减速的效果。尽量按完整句子生成，避免在句中为降低首包等待而过度切碎。
6. 记录发音准确性、句子重音、停顿、弱读连读、英音稳定性、跨段音色一致性，以及漏词、重复或多读的情况。
7. 同时记录冷启动时间、模型加载后首段等待、生成耗时/音频时长、峰值内存；不要把下载与加载时间混为持续朗读延迟。
8. 用户选定声音后，再接入书架并处理预生成缓存、播放暂停、阅读位置和单词高亮。

可用于 Qwen VoiceDesign 的初始声音描述（效果需要试听）：

> A clear, warm and gentle adult female voice with a contemporary standard British English accent. Read like a thoughtful British teacher explaining a passage naturally. Use meaningful sentence stress, natural weak forms and connected speech, varied intonation, and pauses at thought-group boundaries. Keep a comfortable conversational pace with subtle variation. Avoid a uniform word-by-word cadence, exaggerated acting, or a breathy whisper.

这段自然语言描述不能直接当成所有模型的通用参数。Higgs 使用自己的控制方式，按官方提示文档转换；若需参考声音，优先选择授权样本或新合成声音。

可把下面这句话交给下一台电脑上的 Codex：

> 请阅读 `__voice_trials/english-tts-research.md`，检查这台电脑的硬件，先做独立英语试听。优先比较 Higgs TTS 3 与 Qwen3-TTS VoiceDesign，目标是清澈温柔的标准英音女声和自然朗读节奏。先给我试听，不要直接替换书架声音；具体安装和参数按当前官方说明核对。
