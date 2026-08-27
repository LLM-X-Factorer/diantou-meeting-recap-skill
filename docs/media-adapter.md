# 音频和视频适配器合同

第一次运行不需要这个适配器。只有你明确要处理录音或视频，并且材料允许上传给所选服务时再配置。

## Tool 怎样调用适配器

环境变量 `MEETING_ASR_CLI` 必须指向一个可执行文件的绝对路径。Tool 会执行：

```text
<MEETING_ASR_CLI> transcribe <media-path>
  --output <temporary-directory>
  --language zh
  --diarization provider
```

视频会先由 `ffmpeg` 提取成 16 kHz 单声道 MP3，再交给同一个适配器。音频直接传入。

## 适配器必须返回什么

在 `--output` 指定目录写入 `transcript.json`：

```json
{
  "language": "zh",
  "duration_seconds": 8.4,
  "segments": [
    {
      "start": 0,
      "end": 4.1,
      "speaker": "Speaker 1",
      "text": "Beta 版先处理文字反馈和固定标签。"
    }
  ]
}
```

要求：

- `segments` 至少有一项。
- 每项必须有非空 `speaker` 和 `text`。
- `start`、`end` 可以为空，但提供时必须能转成数字。
- 凭据由适配器自己读取，不得出现在命令参数、仓库或返回 JSON 里。

Tool 会把结果保存成两份文件：

- `runtime/normalized-transcript.md`：给下一步内容理解使用。
- `runtime/media-transcript.json`：保存来源、适配器、时长和分段，方便核对。

## 先用假的适配器检查接口

仓库包含 `scripts/fake-asr-cli.mjs`。它不会上传媒体，只返回固定的虚构分段。合同测试用它确认音频和视频能回到同一种标准逐字稿。

```bash
export MEETING_ASR_CLI="$PWD/scripts/fake-asr-cli.mjs"
export MEETING_ASR_PROVIDER='local fake adapter'
npm test
```

假的适配器只证明接口接通，不证明真实录音的识别准确率。

## 接真实服务之前检查

- 录音、视频和说话人信息是否允许上传。
- 服务会把数据存在哪里、保存多久、能否删除。
- 说话人标签、时间戳和断句是否真实可用。
- 听不清、说话人不明或内容冲突时，是否能保留 `待确认`。
- 用同一份脱敏媒体重复运行时，输出是否满足你的验收标准。
