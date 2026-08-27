#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
if (args[0] !== 'transcribe') {
  console.error('fake adapter only supports: transcribe')
  process.exit(2)
}

const input = args[1]
const outputIndex = args.indexOf('--output')
const languageIndex = args.indexOf('--language')
if (!input || outputIndex < 0 || !args[outputIndex + 1]) {
  console.error('missing input or --output')
  process.exit(2)
}

const output = resolve(args[outputIndex + 1])
const language = languageIndex >= 0 ? args[languageIndex + 1] : 'zh'
await mkdir(output, { recursive: true })
const transcript = {
  audio_file: input,
  language,
  duration_seconds: 8.4,
  segments: [
    { start: 0, end: 4.1, speaker: 'Speaker 1', text: 'Beta 版先处理文字反馈和固定标签。' },
    { start: 4.2, end: 8.4, speaker: 'Speaker 2', text: '附件上传不进入本轮范围。' },
  ],
}
await writeFile(resolve(output, 'transcript.json'), `${JSON.stringify(transcript, null, 2)}\n`)
console.log(`Wrote ${resolve(output, 'transcript.json')}`)
