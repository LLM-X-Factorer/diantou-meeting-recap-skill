# Contributing

欢迎通过 Issue 报告问题，也欢迎提交 Pull Request。

提交代码前：

```bash
npm run preflight
npm test
```

Pull Request 请说明：

- 你改的是 Skill、Tool、Hook 还是适配器。
- 修改前能观察到什么问题。
- 为什么当前修改是足够小的一步。
- 同一份虚构输入回归后的结果。
- 如果改动会影响使用方式或输出结果，请同步更新 `CHANGELOG.md`。

不要提交真实会议材料、个人信息、API key、Webhook、模型日志、供应方响应或 `runtime/` 产物。需要展示错误时，请先做最小化和脱敏。
