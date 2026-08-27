# Third-party notices

This repository integrates with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), which is distributed under the MIT License.

The repository does not copy the DeepSeek Harness source tree. It uses the public Skill and plugin extension points documented by that project.

Optional runtime programs are not bundled:

- `weasyprint` is used to render PDF files when installed.
- `ffprobe` and `ffmpeg` are used only by the optional audio/video route.
- A media transcription adapter is supplied by the user and remains responsible for its own service terms, credentials and privacy policy.
