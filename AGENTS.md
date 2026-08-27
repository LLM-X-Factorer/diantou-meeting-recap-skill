# Repository guide

This repository is a public teaching reference for one DeepSeek Harness Skill.

## Product contract

The core path turns one sanitized meeting transcript into `runtime/meeting-recap.md`. PDF and Feishu card outputs must be derived from that Markdown file. Unknown owners, dates, decisions and permissions remain `待确认`. Sending requires explicit approval.

## Change rules

- Keep `.dsh/skills/meeting-recap/SKILL.md` concise and executable. Put teaching commentary in `docs/annotated-SKILL.md`.
- Explain non-obvious boundaries in source comments; do not comment obvious JavaScript syntax.
- Keep the text demo keyless. Media transcription and real Feishu delivery are optional adapters.
- Use only synthetic material in tracked examples and tests.
- Never commit `.env`, `runtime/`, real webhooks, credentials, recordings or private transcripts.
- Update tests and the relevant walkthrough when a Tool name, output contract or Hook decision changes.
- Do not describe contract tests as proof that a learner can implement the Skill or that real Feishu delivery works.
