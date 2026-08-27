# diantou-meeting-recap-skill

[![Contract tests](https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/actions/workflows/ci.yml)

一个可以在 DeepSeek Harness 中调用的会议复盘 Skill。

输入已脱敏的会议逐字稿，或经过授权的录音、视频；输出会议复盘 Markdown、PDF 和飞书卡片。PDF 和卡片都从同一份 Markdown 生成，发送卡片前必须人工确认。

## 功能

- 读取 `.md`、`.txt` 逐字稿
- 通过外部转写程序接入音频和视频
- 保留“负责人待确认”“时间待确认”等原始状态
- 导出 Markdown、A4 PDF 和飞书互动卡片
- 提供本机飞书测试收件箱
- 发送前检查目标并请求人工批准
- 提供 11 项自动测试

## 环境要求

- Node.js 20 或更高版本
- DeepSeek Harness `v0.1.1-rc.2`
- 生成 PDF：`weasyprint`
- 处理音视频：`ffmpeg`、`ffprobe`

运行下面的命令可以检查本机环境：

```bash
npm run preflight
```

## 快速开始

```bash
git clone https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill.git
cd diantou-meeting-recap-skill
npm ci
npm run check
npm run demo
```

`npm run demo` 使用仓库内的虚构逐字稿，不调用模型，也不会发送消息。结果保存在：

```text
runtime/demo/normalized-transcript.md
runtime/demo/meeting-recap.md
runtime/demo/meeting-recap.pdf
runtime/demo/feishu-card.json
```

如果没有安装 `weasyprint`，PDF 步骤会跳过，其他文件仍可生成。

## 在 DeepSeek Harness 中使用

加载本仓库的 Skill 和插件：

```bash
source scripts/harness-env.sh
```

启动 Harness：

```bash
npx @deepseek-ai/dsh@0.1.1-rc.2 web \
  --patch "$MEETING_RECAP_ROOT/cordis.mock.yml" \
  --host 127.0.0.1 \
  --port 3080 \
  --no-open
```

打开 `http://127.0.0.1:3080`，选择当前仓库作为工作区。输入 `/meeting`，候选列表中应出现 `meeting-recap`。

配置可用模型后，可以发送：

```text
/meeting-recap 使用 examples/input/sample-meeting.md，
生成会议复盘、PDF 和飞书卡片，但不要发送。
完成后告诉我生成了哪些文件。
```

第一次运行 `npx` 会下载 Harness 依赖，请预留一些时间。

## 测试飞书卡片

启动本机测试收件箱：

```bash
npm run mock
```

页面地址：

```text
http://127.0.0.1:3099/inbox
```

在启动 Harness 前设置测试地址：

```bash
export FEISHU_CLASSROOM_MOCK_WEBHOOK_URL='http://127.0.0.1:3099/open-apis/bot/v2/hook/meeting-recap-demo'
```

Harness 发送卡片前会要求人工批准。测试收件箱成功接收后，才会生成 `runtime/feishu-receipt.json`。

## 配置

| 名称 | 用途 |
| --- | --- |
| `FEISHU_CLASSROOM_MOCK_WEBHOOK_URL` | 本机测试收件箱地址 |
| `FEISHU_TEST_WEBHOOK_URL` | 真实飞书测试群 Webhook，仅供 `cordis.ask.yml` 使用 |
| `MEETING_ASR_CLI` | 音视频转写程序的可执行文件路径 |
| `MEETING_ASR_PROVIDER` | 写入转写记录的服务名称 |

真实密钥和 Webhook 不要写入仓库。可复制 [`.env.example`](.env.example) 查看需要配置的名称。

## 项目结构

```text
.dsh/skills/meeting-recap/   Skill 工作说明
plugin/index.mjs             Tool 和发送前检查
plugin/lib/                  文件、PDF、卡片和转写处理
examples/                    虚构输入和预期结果
scripts/                     环境检查、Demo 和本机收件箱
tests/                       自动测试
docs/                        设计说明和练习
```

## 文档

- [Skill 逐段说明](docs/annotated-SKILL.md)
- [代码运行过程](docs/code-walkthrough.md)
- [音视频接入说明](docs/media-adapter.md)
- [修改练习](docs/follow-up-exercises.md)

## 开发

```bash
npm test
npm run demo
```

Pull Request 会在 Node.js 20 环境中运行完整检查。修改 Tool、输出文件或发送规则时，请同步更新测试和对应文档。

## 当前限制

- 只在 DeepSeek Harness `v0.1.1-rc.2` 上验证过。
- 音视频识别质量取决于接入的转写服务。
- 公开仓库没有验证真实飞书群发送。
- 自动测试通过不代表它已经适合正式生产环境。

## 参与贡献

提交 Issue 或 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 说明处理。

## License

[MIT](LICENSE)。第三方项目说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
