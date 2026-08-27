# Changelog

这个文件记录每个正式版本中，使用者能够观察到的变化。

## [Unreleased]

暂无。

## [0.1.0] - 2026-08-27

首个公开版本。

### Added

- 提供可由 DeepSeek Harness 调用的 `meeting-recap` Skill。
- 支持文字逐字稿，以及可选的音频、视频转写程序。
- 生成会议复盘 Markdown、A4 PDF 和飞书互动卡片。
- 提供本机飞书测试收件箱和发送前人工批准。
- 对路径越界、输入变化、输出结构、发送拒绝和回执写入提供自动测试。
- 提供虚构示例、首次使用教程、代码说明、音视频接入说明和修改练习。
- 在 GitHub Actions 的 Node.js 20 环境中运行完整检查。

### Known limitations

- 只在 DeepSeek Harness `v0.1.1-rc.2` 上验证过。
- 没有在原生 Windows 终端中验证过。
- 没有把真实飞书群发送或生产环境使用列为已完成验证。

[Unreleased]: https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/LLM-X-Factorer/diantou-meeting-recap-skill/releases/tag/v0.1.0
