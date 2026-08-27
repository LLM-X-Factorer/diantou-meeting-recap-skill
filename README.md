# 把一份会议逐字稿整理成复盘、PDF 和飞书卡片

如果你刚上完课，想自己把会议复盘 Skill 跑一遍，可以从这个仓库开始。

仓库里已经放好一份虚构的会议逐字稿。你不需要准备真实会议材料，也不需要先配置模型。运行示例后，你会拿到：

- 一份整理过的会议逐字稿
- 一份会议复盘 Markdown
- 一份内容相同的 PDF
- 一张尚未发送的飞书卡片

例子里的姓名和会议内容都是虚构的，可以放心拿来练习。

## 先在本机跑一次

需要 Node.js 20 或更高版本。

在仓库目录里依次运行：

```bash
npm run preflight
npm test
npm run demo
```

三条命令分别做这些事：

1. `npm run preflight`：检查 Node.js，以及生成 PDF、处理音视频会用到的程序。
2. `npm test`：运行仓库自带的测试。当前一共 11 项。
3. `npm run demo`：读取 [示例逐字稿](examples/input/sample-meeting.md)，生成一套示例结果。

运行结束后，打开 `runtime/demo/`：

```text
runtime/demo/normalized-transcript.md
runtime/demo/meeting-recap.md
runtime/demo/meeting-recap.pdf
runtime/demo/feishu-card.json
```

先看 `meeting-recap.md`。PDF 和飞书卡片都从这份 Markdown 生成，所以三份内容应该一致。如果 Markdown 里写的是“负责人待确认”，卡片里也不能擅自补出一个负责人。

如果电脑没有安装 `weasyprint`，示例会跳过 PDF，Markdown 和飞书卡片仍然可以正常生成。

这一步不会调用模型，不会上传逐字稿，也不会向飞书发送消息。

## 再放进 DeepSeek Harness 里试

这套代码在 DeepSeek Harness `v0.1.1-rc.2` 上跑通过。Harness 目前还是预览版，以后的版本可能会改接口。如果你换了版本，请重新运行测试。

先让 Harness 找到仓库里的 Skill 和插件：

```bash
source scripts/harness-env.sh
```

然后启动 Harness：

```bash
npx @deepseek-ai/dsh@0.1.1-rc.2 web \
  --patch "$MEETING_RECAP_ROOT/cordis.mock.yml" \
  --host 127.0.0.1 \
  --port 3080 \
  --no-open
```

第一次运行 `npx` 会下载 Harness，可能会等一会儿。如果准备在课堂上演示，请提前运行一次；看到下面这行就说明已经启动：

```text
dsh web: http://127.0.0.1:3080
```

接下来：

1. 用浏览器打开 `http://127.0.0.1:3080`。
2. 选择 `diantou-meeting-recap-skill` 作为工作区。
3. 在输入框输入 `/meeting`。
4. 确认候选列表里出现 `meeting-recap`。

如果只是检查 Harness 能不能找到 Skill，可以在 API Key 弹窗里点“稍后配置”。如果要让模型真正完成任务，需要先在 Harness 中配置可用模型。本仓库不会读取其他项目里的 API Key。

配置好模型后，发送：

```text
/meeting-recap 使用 examples/input/sample-meeting.md，
生成会议复盘、PDF 和飞书卡片，但不要发送。
完成后告诉我生成了哪些文件。
```

## 页面里应该出现哪些步骤

Harness 会让模型依次调用五个小程序。在 Harness 里，这种能被模型调用的小程序叫 Tool。

```text
normalize_transcript
→ load_normalized_transcript
→ save_meeting_recap
→ export_recap_pdf
→ prepare_feishu_card
```

它们做的事情并不神秘：

1. 整理逐字稿的格式。
2. 读取完整逐字稿。
3. 保存会议复盘。
4. 把复盘转成 PDF。
5. 把复盘装进飞书卡片。

这次要求“不要发送”，所以页面里不应该出现 `publish_feishu_card`。如果出现了，说明模型没有遵守任务要求，或者 Skill 的规则写得不够清楚。

## 用本机收件箱模拟发送

仓库里带了一个假的飞书收件箱。它只在你的电脑上运行，不会连接真实飞书群。

打开第一个终端，运行：

```bash
npm run mock
```

打开第二个终端，运行：

```bash
source scripts/harness-env.sh
export FEISHU_CLASSROOM_MOCK_WEBHOOK_URL='http://127.0.0.1:3099/open-apis/bot/v2/hook/meeting-recap-demo'
npx @deepseek-ai/dsh@0.1.1-rc.2 web \
  --patch "$MEETING_RECAP_ROOT/cordis.mock.yml" \
  --host 127.0.0.1 \
  --port 3080 \
  --no-open
```

浏览器里打开 `http://127.0.0.1:3099/inbox`，这就是本机测试收件箱。

回到刚才的 Harness 会话，输入：

```text
把刚才准备好的卡片发送到飞书测试群。
```

发送之前，Harness 会弹出确认。只有你同意、收件箱也确认收到以后，才会生成：

```text
runtime/feishu-receipt.json
```

看到这个文件，只能说明本机测试收件箱收到了卡片，不能说明真实飞书群已经收到。

## 想看懂代码，从这几处开始

不需要一次读完整个仓库。可以按下面的顺序看：

1. [真正交给模型的工作说明](.dsh/skills/meeting-recap/SKILL.md)
2. [这份工作说明为什么这样写](docs/annotated-SKILL.md)
3. [七个 Tool 和发送前检查](plugin/index.mjs)
4. [一次任务怎样走到最终文件](docs/code-walkthrough.md)
5. [自动测试具体检查什么](tests/contracts.test.mjs)
6. [四个可以自己动手改的任务](docs/follow-up-exercises.md)

几个目录分别管这些事：

- `.dsh/skills/meeting-recap/SKILL.md`：告诉模型先做什么、后做什么，哪些内容不能猜。
- `plugin/index.mjs`：把七个 Tool 交给 Harness，并在发送前要求人工确认。
- `plugin/lib/`：真正读写文件、生成 PDF、制作卡片和发送消息。
- `tests/`：故意制造成功和失败的情况，检查代码有没有把失败误报成成功。

代码里还会看到 Hook。这里的 Hook 就是“Tool 真正执行前先检查一次”。例如发送飞书卡片前，它会确认目标是不是测试群，并要求你手动批准。

## 音频和视频怎么接进来

第一次练习先用文字，不需要碰音频和视频。

如果你已经有自己的语音转文字服务，再阅读 [音视频接入说明](docs/media-adapter.md)。录音或视频可能会被上传到第三方服务，所以使用前要先确认：材料已经脱敏、参会人允许上传、你知道服务商会怎样保存这些文件。

仓库里自带的是一个假转写程序，只用来检查代码能不能接上，不代表真实录音能识别准确。

## 目前确认过什么

已经确认：

- 示例文字可以生成 Markdown、PDF 和飞书卡片。
- 音频和视频可以通过统一接口交给转写程序。
- 发送前会要求人工确认。
- 本机收件箱拒绝消息时，不会留下“发送成功”的回执。
- 在 Harness `v0.1.1-rc.2` 中输入 `/meeting`，可以找到这个 Skill。
- GitHub 每次收到提交后，会自动运行测试。

还没有确认：

- 不同模型整理同一场会议时是否都足够准确。
- 真实飞书测试群是否已经收到过这套仓库发出的卡片。
- 同学看完文档后，能否独立完成修改。
- 这套代码是否适合直接用在公司的正式环境。

这些事情需要分别验证，不能因为测试通过就当成全部完成。

## License

MIT。第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
