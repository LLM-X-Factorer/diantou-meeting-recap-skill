import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { validateMeetingRecap } from './recap.mjs'
import { readBoundedText, resolveWorkspacePath, runFile, workspaceRelative } from './workspace.mjs'

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function markdownToHtml(markdown) {
  const body = []
  let inList = false
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.startsWith('- ')) {
      if (!inList) {
        body.push('<ul>')
        inList = true
      }
      body.push(`<li>${escapeHtml(line.slice(2))}</li>`)
      continue
    }
    if (inList) {
      body.push('</ul>')
      inList = false
    }
    if (line.startsWith('# ')) body.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
    else if (line.startsWith('## ')) body.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
    else if (line === '') body.push('')
    else body.push(`<p>${escapeHtml(line).replaceAll(/`([^`]+)`/g, '<code>$1</code>')}</p>`)
  }
  if (inList) body.push('</ul>')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 17mm 20mm; }
body { font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; color: #17233d; font-size: 11pt; line-height: 1.65; }
h1 { color: #0a3472; font-size: 24pt; margin: 0 0 12mm; border-bottom: 3px solid #ffc107; padding-bottom: 5mm; }
h2 { color: #0a3472; font-size: 15pt; margin: 7mm 0 3mm; page-break-after: avoid; }
p { margin: 0 0 3mm; }
body > p:last-child { break-before: avoid; }
ul { margin: 0 0 4mm 1.5em; padding: 0; }
li { margin: 0 0 1.5mm; }
code { background: #eef3f9; padding: 1px 4px; border-radius: 3px; }
</style></head><body>${body.join('\n')}</body></html>`
}

/** PDF is a renderer output, never a second model-written summary. */
export async function exportMeetingRecapPdf({
  workspace,
  inputPath = 'runtime/meeting-recap.md',
  outputPath = 'runtime/meeting-recap.pdf',
  signal,
}) {
  const source = await resolveWorkspacePath(workspace, inputPath, { mustExist: true })
  const output = await resolveWorkspacePath(workspace, outputPath)
  const markdown = validateMeetingRecap(await readBoundedText(source))
  const tempRoot = await mkdtemp(join(tmpdir(), 'meeting-recap-pdf-'))

  try {
    const htmlPath = join(tempRoot, 'meeting-recap.html')
    await writeFile(htmlPath, markdownToHtml(markdown))
    await mkdir(dirname(output), { recursive: true })
    await runFile('weasyprint', [htmlPath, output], { signal })
    const pdf = await readFile(output)
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('renderer did not produce a PDF file')
    }
    return {
      input_path: await workspaceRelative(workspace, source),
      output_path: await workspaceRelative(workspace, output),
      bytes: pdf.length,
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
