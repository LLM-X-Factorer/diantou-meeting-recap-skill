# Security

## Supported scope

This repository is a teaching reference implementation. It is not presented as a production messaging system.

## Report a problem

Do not open a public issue containing an API key, webhook URL, meeting recording, raw transcript, personal information or provider response. Remove the sensitive material first, then describe only the reproducible behavior.

## Built-in boundaries

- The default demo uses a synthetic transcript and a loopback Mock receiver.
- `runtime/` and `.env` are ignored by Git.
- Workspace paths are confined to the selected workspace.
- Real Feishu delivery accepts only allowlisted HTTPS hosts and requires a Harness approval decision.
- Media transcription is optional and may upload the file to the adapter's provider; obtain permission and sanitize the material first.
