# diantou-meeting-recap-skill

[![Contract tests](https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/actions/workflows/ci.yml)

一个可以在 DeepSeek Harness 中调用的会议复盘 Skill。

输入已脱敏的会议逐字稿，或经过授权的录音、视频；输出会议复盘 Markdown、PDF 和飞书卡片。PDF 和卡片都从同一份 Markdown 生成，发送卡片前必须人工确认。

当前版本：[`v0.1.0`](https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/releases/tag/v0.1.0)

## 功能

- 读取 `.md`、`.txt` 逐字稿
- 通过外部转写程序接入音频和视频
- 保留“负责人待确认”“时间待确认”等原始状态
- 导出 Markdown、A4 PDF 和飞书互动卡片
- 提供本机飞书测试收件箱
- 发送前检查目标并请求人工批准
- 提供 11 项自动测试

## 环境要求

- Git
- Node.js 20 或更高版本
- macOS 或 Linux；Windows 建议在 WSL 中运行
- DeepSeek Harness `v0.1.1-rc.2`
- 生成 PDF：`weasyprint`
- 处理音视频：`ffmpeg`、`ffprobe`

运行下面的命令可以检查本机环境：

```bash
npm run preflight
```

## 第一次使用：先跑通仓库自带的例子

这一部分暂时不接模型。先用仓库自带的虚构逐字稿，确认代码能在你的电脑上生成文件。

### 1. 下载代码

打开终端，逐行运行：

```bash
git clone https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill.git
cd diantou-meeting-recap-skill
```

第二行会让终端进入刚下载的仓库。后面的命令都要在这个目录里运行。

### 2. 安装依赖

```bash
npm ci
```

这个仓库没有需要额外下载的 JavaScript 依赖，但这条命令会检查 `package-lock.json` 是否正常。看到 `found 0 vulnerabilities` 就可以继续。

### 3. 检查本机环境

```bash
npm run preflight
```

必须项通过时会显示 `PASS`。`weasyprint`、`ffmpeg` 和 `ffprobe` 是可选项，安装后显示 `PASS`，没有安装则显示 `SKIP`：

- 没有 `weasyprint`：暂时不能生成 PDF。
- 没有 `ffmpeg` 或 `ffprobe`：暂时不能处理录音和视频。
- 只练习文字逐字稿时，可以先继续。

### 4. 运行测试

```bash
npm test
```

成功时，终端结尾会显示：

```text
pass 11
fail 0
```

如果 `fail` 不是 `0`，先不要进入 Harness。向上找到第一条带 `✖` 的测试，它通常会说明缺少哪个文件或哪一步没有按预期工作。

### 5. 生成示例文件

```bash
npm run demo
```

这条命令会读取 [示例逐字稿](examples/input/sample-meeting.md)，结果保存在 `runtime/demo/`：

| 文件 | 内容 |
| --- | --- |
| `normalized-transcript.md` | 整理过格式的逐字稿 |
| `meeting-recap.md` | 会议主题、决定、待办和待确认问题 |
| `meeting-recap.pdf` | 与 Markdown 内容相同的 PDF |
| `feishu-card.json` | 尚未发送的飞书卡片数据 |

先打开 `runtime/demo/meeting-recap.md`，检查“第一批体验用户邀请”是否仍然写着负责人待确认。再看终端输出的最后一项：

```json
"sent": false
```

它表示这次只生成了文件，没有发送消息。这个过程中不会调用模型，也不会上传逐字稿。

如果没有安装 `weasyprint`，示例会跳过 PDF，其他三个文件仍可生成。

完成这一步后，再继续下面的 Harness 用法。

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

## 常见问题

| 现象 | 处理方法 |
| --- | --- |
| `command not found: git` | 先安装 Git，再重新运行下载命令。 |
| `command not found: npm` | 先安装 Node.js 20 或更高版本，再重新打开终端。 |
| `preflight` 显示 `SKIP optional PDF route` | 没有安装 `weasyprint`。可以先看 Markdown 和卡片，或者安装后重新运行。 |
| 输入 `/meeting` 后没有出现 `meeting-recap` | 确认执行过 `source scripts/harness-env.sh`，并在网页中选择了当前仓库。 |
| 终端提示端口已被占用 | 把启动命令中的 `--port 3080` 换成其他端口，并用新端口打开网页。 |
| 第一次运行 `npx` 很久没有输出 | Harness 正在下载依赖。等待完成后，下一次启动会更快。 |

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
- [版本记录](CHANGELOG.md)

## 开发

```bash
npm test
npm run demo
```

Pull Request 会在 Node.js 20 环境中运行完整检查。修改 Tool、输出文件或发送规则时，请同步更新测试和对应文档。

## 当前限制

- 只在 DeepSeek Harness `v0.1.1-rc.2` 上验证过。
- 没有在原生 Windows 终端中验证过。
- 音视频识别质量取决于接入的转写服务。
- 公开仓库没有验证真实飞书群发送。
- 自动测试通过不代表它已经适合正式生产环境。

## 参与贡献

提交 Issue 或 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 说明处理。

## License

[MIT](LICENSE)。第三方项目说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
