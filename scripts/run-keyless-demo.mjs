import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  exportMeetingRecapPdf,
  loadNormalizedTranscript,
  normalizeTranscriptFile,
  prepareFeishuCard,
  saveMeetingRecap,
} from '../plugin/lib/index.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const demoRoot = 'runtime/demo'

function commandExists(command, args = ['--version']) {
  return new Promise(resolvePromise => {
    execFile(command, args, error => resolvePromise(!error))
  })
}

const normalized = await normalizeTranscriptFile({
  workspace: root,
  inputPath: 'examples/input/sample-meeting.md',
  outputPath: `${demoRoot}/normalized-transcript.md`,
})
const loaded = await loadNormalizedTranscript({
  workspace: root,
  inputPath: normalized.output_path,
})

// The keyless demo uses a checked expected answer. In a Harness session the
// model supplies these facts after reading the normalized transcript.
const expected = await readFile(join(root, 'examples/expected/meeting-recap.md'), 'utf8')
const recap = await saveMeetingRecap({
  workspace: root,
  markdown: expected,
  outputPath: `${demoRoot}/meeting-recap.md`,
})
const card = await prepareFeishuCard({
  workspace: root,
  inputPath: recap.output_path,
  outputPath: `${demoRoot}/feishu-card.json`,
})

let pdf = null
if (await commandExists('weasyprint')) {
  pdf = await exportMeetingRecapPdf({
    workspace: root,
    inputPath: recap.output_path,
    outputPath: `${demoRoot}/meeting-recap.pdf`,
  })
}

console.log(JSON.stringify({
  mode: 'keyless-demo',
  source_hash: loaded.source_hash,
  outputs: {
    normalized_transcript: normalized.output_path,
    meeting_recap: recap.output_path,
    pdf: pdf?.output_path || 'SKIPPED: install weasyprint',
    feishu_card: card.output_path,
  },
  sent: false,
}, null, 2))
