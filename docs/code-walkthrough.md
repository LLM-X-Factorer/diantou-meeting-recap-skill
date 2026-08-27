# 从一次调用走到最终文件

先用文本路线看，音频和视频只是把第一步替换成转写适配器。

```text
/meeting-recap 使用 examples/input/sample-meeting.md，生成复盘、PDF 和飞书卡片，但不要发送。
```

## 1. Harness 先加载 Skill

Harness 从 `.dsh/skills/meeting-recap/SKILL.md` 读取名称、说明和正文。Skill 告诉模型该做什么，但它自己没有读写文件的能力。

可以先把 `SKILL.md` 暂时改名，再在 WebUI 输入 `/meeting`。自动补全消失，说明“仓库里有一份 Markdown”与“Harness 已经加载 Skill”不是同一件事。测试后请改回原名。

## 2. `plugin/index.mjs` 把 Tool 注册给 Harness

[`createToolDefinitions`](../plugin/index.mjs) 返回 7 个 Tool。每个 Tool 都有四块：

- `name`：模型在运行记录里看到的名字。
- `description`：模型什么时候应该调用它。
- `parameters`：允许传入哪些参数。
- `execute`：真正调用哪段确定性代码。

例如 `normalize_transcript` 的 `execute` 只把 Harness 传来的工作区和参数交给 `normalizeTranscriptFile`。文件处理不写在注册表里，这样注册表可以专心说明“模型看见什么”。

## 3. 文本进入标准逐字稿

[`plugin/lib/transcript.mjs`](../plugin/lib/transcript.mjs) 做三件事：

1. 检查输入路径没有跑出当前工作区。
2. 统一换行、尾部空格和连续空行。
3. 写入 `runtime/normalized-transcript.md`。

路径检查在 [`plugin/lib/workspace.mjs`](../plugin/lib/workspace.mjs)。它不仅检查 `../`，也检查父目录里的符号链接，避免输出看起来在工作区里，实际落到外部目录。

接着 `load_normalized_transcript` 读取完整文本并计算 SHA-256。哈希放在当前 Harness session 对应的 `WeakMap` 里。

## 4. 模型提炼事实，Tool 固定文档结构

模型从逐字稿提炼七个字段：会议主题、关键讨论、已确认决定、待办、待确认问题等。

[`renderStructuredMeetingRecap`](../plugin/lib/recap.mjs) 再把字段排进固定标题顺序，并补上 `状态：未发送。`。如果字段为空、标题缺失或顺序不对，Tool 直接失败。

这里有一条有意保留的分工：

- “这句话是不是已确认决定”由模型根据原文判断。
- “文档必须有哪些标题”由代码确定。

测试既检查合法结构，也保留了“体验用户负责人待确认”的具体样例。只检查标题数量抓不到事实被擅自补全的问题。

## 5. PDF 和卡片不再调用模型

[`plugin/lib/pdf.mjs`](../plugin/lib/pdf.mjs) 把同一份 Markdown 转成 HTML，再交给 `weasyprint`。

[`plugin/lib/feishu.mjs`](../plugin/lib/feishu.mjs) 把同一份 Markdown 放进飞书互动卡片 JSON。

如果要增加 DOCX，正确位置是新增一个读取 `meeting-recap.md` 的 Tool，而不是让模型重新生成一份 Word 内容。

## 6. Hook 在发送之前出现

[`plugin/lib/policy.mjs`](../plugin/lib/policy.mjs) 处理两类调用：

- `publish_feishu_card`：目标不是测试群就拒绝；目标正确时请求一次批准。
- 通用编辑器：试图修改流水线拥有的文件时拒绝。

`plugin/index.mjs` 把这两个判断挂到 Harness 的 `tools/pre-execute`。Hook 发生在发送函数之前，所以用户点击拒绝时，请求不会到达 Mock 或飞书。

## 7. 先看接收端，再写回执

发送函数只接受三类地址：

- HTTPS `open.feishu.cn`
- HTTPS `open.larksuite.com`
- 显式启用 Mock 时的本机 loopback HTTP

接收端必须返回成功 HTTP 和成功业务码。两项都成立以后，才写 `feishu-receipt.json`。测试里另有一个“HTTP 200 但业务码失败”的接收器，用来确认这种情况不会留下成功回执。

## 你修改代码时先判断改哪层

- 改“什么时候做、事实不能怎么改”：改 `SKILL.md`。
- 改模型能调用的名称或参数：改 `plugin/index.mjs`。
- 改文件格式、PDF、卡片：改 `plugin/lib/`。
- 改发送许可：改 `policy.mjs` 和对应测试。
- 改完不知道从哪里重跑：先运行最接近的合同测试，再跑完整 `npm test`。
