---
name: meeting-recap
description: 把已脱敏的会议逐字稿、录音或视频整理成可核对的会议复盘，并从同一 Markdown 真源导出 PDF 和飞书测试卡片；适用于会后整理，不适用于未经授权的上传或自动群发。
---

# 会议复盘

使用这套流程处理一场已经脱敏、允许当前环境读取的会议记录。

## 完成标准

一次完整但未发送的运行应留下：

1. `runtime/normalized-transcript.md`
2. 媒体输入额外留下 `runtime/media-transcript.json`
3. `runtime/meeting-recap.md`
4. `runtime/meeting-recap.pdf`
5. `runtime/feishu-card.json`

只有发送工具真正得到接收端成功响应后，才应出现 `runtime/feishu-receipt.json`。

`runtime/meeting-recap.md` 是唯一内容真源。PDF 和飞书卡片只能从它生成，不要分别重新概括。

## 选择输入路线

- `.md` 或 `.txt`：调用 `normalize_transcript`。
- 音频或视频：只有用户允许上传给已配置的转写服务时，才调用 `transcribe_media`。
- 用户没有明确指定媒体文件时，优先使用文本路线。

两条路线都会生成 `runtime/normalized-transcript.md`。不要把文本文件先交给媒体转写，也不要同时混跑两条路线。

## 生成会议复盘

先调用 `load_normalized_transcript` 读取完整标准逐字稿，再根据原文填写结构化字段并调用一次 `save_meeting_recap`。

复盘必须保留原文的事实状态：

- 原文没有确认的负责人、日期、决定或授权继续写为 `待确认`。
- 不把讨论意见改写成已确认决定。
- 不补写原文没有提供的信息。
- 不复制整篇逐字稿充当复盘。

保存后的 Markdown 必须依次包含：

- `# <具体标题>`
- `## 会议主题`
- `## 关键讨论`
- `## 已确认决定`
- `## 待办事项`
- `## 待确认问题`
- `## 群内发布摘要`
- `状态：未发送。`

标准逐字稿和流水线产物由专用 Tool 管理。不要使用通用写文件工具绕过结构检查。

## 派生产物

成功保存复盘后，依次调用：

1. `export_recap_pdf`
2. `prepare_feishu_card`

任何一步失败都停在当前步骤，不要重新生成已经正确的上游文件。

## 发送边界

只有用户明确要求发送到飞书测试群时，才调用 `publish_feishu_card`，并传入 `destination: "feishu-test-group"`。

发送前的 Harness 批准门不可绕过。拒绝、取消、无人应答、凭据缺失、接收端报错或旧回执都不表示本次发送成功。只有工具返回 `delivered: true`，并且本次生成了新回执，才可以说明接收端已经接受。
