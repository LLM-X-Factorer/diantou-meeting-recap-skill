# `meeting-recap`：一份可以继续改的 DeepSeek Harness Skill

这个仓库只演示一件事：给 DeepSeek Harness 一份已经脱敏的会议逐字稿，让它生成一份可以核对的会议复盘，再从同一份 Markdown 生成 PDF 和飞书卡片。卡片默认只发到本机 Mock；真实发送必须单独配置，并经过人工批准。

仓库里的例子、姓名和会议内容都是虚构的。

## 先看它会留下什么

一次“生成但不发送”的运行会留下：

```text
runtime/normalized-transcript.md
runtime/meeting-recap.md
runtime/meeting-recap.pdf
runtime/feishu-card.json
```

`meeting-recap.md` 是唯一内容真源。PDF 和卡片只负责换一种呈现方式，不会让模型再写一遍内容。

## 第一次运行：不需要模型和密钥

准备 Node.js 20 或更高版本，然后运行：

```bash
npm run preflight
npm test
npm run demo
```

`npm run demo` 会读取 [虚构逐字稿](examples/input/sample-meeting.md)，把结果写到 `runtime/demo/`。如果本机装有 `weasyprint`，它还会生成 PDF；没有安装时会明确跳过 PDF，不影响先看 Markdown 和飞书卡片。

这一段验证的是确定性代码，不会调用模型，也不会访问飞书。

推送到 GitHub 后，Pull Request 会在 Node.js 20 上自动运行同一套合同检查。媒体和 PDF 所需的 `ffmpeg`、`weasyprint`、`pdfinfo` 也会在 CI 中安装，不会静默跳过对应测试。

## 在 DeepSeek Harness 里调用

本仓库按 DeepSeek Harness `v0.1.1-rc.2`（提交 `b150a55`）验证。Harness 仍处于 developer preview，升级版本前请重新运行测试和 WebUI 走查。

先加载本仓库路径：

```bash
source scripts/harness-env.sh
```

如果你已经在 Harness 中配置了可用模型，可以直接在仓库根目录启动：

```bash
npx @deepseek-ai/dsh@0.1.1-rc.2 web \
  --patch "$MEETING_RECAP_ROOT/cordis.mock.yml" \
  --host 127.0.0.1 \
  --port 3080 \
  --no-open
```

Harness 的 npm 包较多。第一次使用 `npx` 时会先下载依赖，终端可能暂时没有输出；如果要在课堂上演示，请务必提前运行到看到 `dsh web: http://127.0.0.1:3080`，再按 `Ctrl+C` 停掉。不要把首次下载留到直播现场。

打开 `http://127.0.0.1:3080`，选择当前仓库 `diantou-meeting-recap-skill` 作为工作区，然后输入 `/meeting`。先确认自动补全里出现 `meeting-recap`，再发送：

```text
/meeting-recap 使用 examples/input/sample-meeting.md，
生成会议复盘、PDF 和飞书卡片，但不要发送。
完成后告诉我生成了哪些文件。
```

正常轨迹是：

```text
normalize_transcript
→ load_normalized_transcript
→ save_meeting_recap
→ export_recap_pdf
→ prepare_feishu_card
```

这里不应该出现 `publish_feishu_card`。

如果只是检查自动补全，可以在首次弹窗里选择“稍后配置”；要真正发送上面的任务，仍然需要先在 Harness 中配置可用模型。本仓库不会读取其他项目里的 API Key。

## 看一次 Mock 发送

终端 A：

```bash
npm run mock
```

终端 B：

```bash
source scripts/harness-env.sh
export FEISHU_CLASSROOM_MOCK_WEBHOOK_URL='http://127.0.0.1:3099/open-apis/bot/v2/hook/meeting-recap-demo'
npx @deepseek-ai/dsh@0.1.1-rc.2 web \
  --patch "$MEETING_RECAP_ROOT/cordis.mock.yml" \
  --host 127.0.0.1 \
  --port 3080 \
  --no-open
```

打开 Mock 收件箱：`http://127.0.0.1:3099/inbox`。在刚才的 Harness 会话中输入：

```text
把刚才准备好的卡片发送到飞书测试群。
```

Harness 应出现一次性批准面板。批准后，只有工具返回 `delivered: true`，并生成 `runtime/feishu-receipt.json`，才算 Mock 接收成功。页面会一直标明它是本机替身，不是真实飞书群。

## 从哪里开始读代码

建议按这个顺序：

1. [真正运行的 Skill](.dsh/skills/meeting-recap/SKILL.md)
2. [逐段解释版 Skill](docs/annotated-SKILL.md)
3. [Tool 注册和 Hook](plugin/index.mjs)
4. [代码走读](docs/code-walkthrough.md)
5. [合同测试](tests/contracts.test.mjs)
6. [课后修改任务](docs/follow-up-exercises.md)

目录里的责任分工很直接：

- `SKILL.md`：告诉模型什么时候做、按什么事实边界做。
- `plugin/index.mjs`：把 Tool 名称、参数和 Hook 注册给 Harness。
- `plugin/lib/`：处理文件、结构、PDF、卡片和发送。
- `tests/`：检查失败是否真的失败、成功是否留下可核对产物。

## 音频和视频

媒体路线不是第一次运行的前提。需要时先阅读 [媒体适配器合同](docs/media-adapter.md)。媒体文件可能被上传到第三方服务，只有在材料已经脱敏、参会人允许、供应方边界明确时才启用。

## 当前边界

- 文本、结构化复盘、PDF、卡片、Hook 和 Mock 回执有自动化合同测试。
- 在固定版本 Harness WebUI 中选择本仓库后，`/meeting` 可以发现 `meeting-recap`。
- 真实模型运行仍取决于你在 Harness 中配置的模型。
- 真实飞书测试群发送没有被这个公开候选仓库声明为已验收。
- 自动化测试通过不表示学员已经学会修改，也不表示这套代码适合生产环境。

## License

MIT。第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
