# 本地朗读

中文只使用 Qwen3-TTS Serena，保留试听选定的温柔普通话风格和 1.24 倍语速，变速时保持音高。阅读页「中文音色」可试听；已有的其他音色选择会自动迁移至 Serena。英文使用用户选定的 Qwen VoiceDesign「清晰讲解版」英音女声，原始语速，不再使用 Kokoro Heart。

英文原始试听完整保存在 `previews/english-teacher.wav`（来自 `english-design-f202d489400e/teacher.wav`）。`references/english-teacher.wav` 为其前 15.7 秒，结束于完整句子后的停顿；对应文字、校验值、模型版本及生成设置记录在 `english-profile.json`。正文由 Qwen3-TTS Base 8-bit 以该合成音频为参考生成，以固定音色；新文本的语气与节奏由模型生成，不是对原始试听逐字复刻。

`profiles.json` 记录合成配置，`previews/serena.wav` 保存选定版本的试听音频，正文使用相同配置实时生成。

## 启动

当前中英文后端需要 Apple Silicon Mac。在 `__pages` 下执行 `npm ci`、`npm start`。首次安装需要联网下载 Python 环境和模型；完成后朗读可离线使用。只准备中文模型可运行 `npm run setup:chinese`，英文为 `npm run setup:english`。英语启动不再依赖旧 Kokoro 模型归档。

中文模型与试听工具共用仓库 `__voice_trials` 目录中的 `.venv` 和 `.engines/qwen-model`，避免重复下载。该目录下的脚本需要随项目保留；环境、模型和试听输出已被 Git 忽略。可通过 `BOOKSHELF_VOICE_HOME` 指定另一套兼容的完整运行目录。书架只准备和加载 Qwen，不会安装或加载 CosyVoice、IndexTTS。独立试听工具保留。

中文 Qwen 使用固定版本的 `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`，版本记录在 `__voice_trials/setup.py`。英文使用固定版本的 `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit`，约 3.1 GB，放在 `.engines/qwen-base-8bit`；只需下载 Base，书架不加载 VoiceDesign 或 Fish。参考和试听 WAV 随项目保存，大模型不提交到 Git。

## 播放

服务启动时预加载模型，中英文 Python 进程各自持续复用模型。英文优先整句生成，超过 450 字符才切分；中文保留现有分句逻辑。请求排队生成，浏览器预取下一句；生成后的 WAV 按语言、音色和文字缓存，最多占用 16 MiB，重启清空。停止服务时同时结束两个模型进程。生成耗时可能高于旧 Kokoro，首句尤其需要等待。

保留暂停、继续、段落播放和当前行波浪线。

Serena 的保音高变速函数取自 MIT 许可的 mlx-indextts，许可见 `third-party/WSOLA-LICENSE.txt`；不需要安装 IndexTTS。

### 朗读位置与控制

朗读栏用一个按钮切换播放和暂停，也可按空格（输入框、词典和弹窗中不拦截）。暂停时显示“上次读到”，播放时显示当前句子。段落左侧保留从本段开始朗读的入口。

每本书的 `meta_data/reading.json` 保存章节、段落原文、句首字符偏移、句子、语言和更新时间。实际开始播放句子时写入；预加载不推进记录。同一页面暂停后继续当前音频，刷新后从已保存句子的开头恢复。

当前词与波浪线共用音频时钟和能量估算进度；模型未返回逐词时间戳，因此标记是近似跟随。正文使用 CSS Highlight 的字形阴影加重当前词，避免字重变化导致重新换行；朗读栏用加粗文字同步显示。
