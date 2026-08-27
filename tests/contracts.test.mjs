import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildFeishuCard,
  exportMeetingRecapPdf,
  loadNormalizedTranscript,
  normalizeTranscriptFile,
  prepareFeishuCard,
  publishFeishuCard,
  renderStructuredMeetingRecap,
  saveMeetingRecap,
  transcribeMediaFile,
  validateMeetingRecap,
} from '../plugin/lib/index.mjs'
import {
  createToolDefinitions,
  decideProtectedArtifactWrite,
  decidePublish,
} from '../plugin/index.mjs'
import { startMockFeishuWebhook } from '../scripts/mock-feishu-webhook.mjs'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fakeAsrCli = join(repositoryRoot, 'scripts', 'fake-asr-cli.mjs')

function runFile(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) return rejectPromise(new Error(String(stderr || stdout || error.message)))
      resolvePromise({ stdout, stderr })
    })
  })
}

function commandExists(command, args = ['--version']) {
  return new Promise(resolvePromise => {
    execFile(command, args, error => resolvePromise(!error))
  })
}

async function withWorkspace(run) {
  const workspace = await mkdtemp(join(tmpdir(), 'meeting-recap-test-'))
  try {
    await mkdir(join(workspace, 'examples', 'input'), { recursive: true })
    await copyFile(
      join(repositoryRoot, 'examples', 'input', 'sample-meeting.md'),
      join(workspace, 'examples', 'input', 'sample-meeting.md'),
    )
    await run(workspace)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

const expectedRecap = await readFile(
  join(repositoryRoot, 'examples', 'expected', 'meeting-recap.md'),
  'utf8',
)
const hasWeasyPrint = await commandExists('weasyprint')
const hasPdfInfo = await commandExists('pdfinfo')
const hasFfmpeg = await commandExists('ffmpeg', ['-version'])
const hasFfprobe = await commandExists('ffprobe', ['-version'])

test('Harness patches use the in-browser workspace picker', async () => {
  for (const configName of ['cordis.mock.yml', 'cordis.ask.yml']) {
    const config = await readFile(join(repositoryRoot, configName), 'utf8')
    assert.match(config, /id: directory-picker\n  disabled: true/)
    assert.match(config, /@deepseek-ai\/dsh-host-directory-picker-browse/)
    assert.match(config, /@deepseek-ai\/dsh-client-ui-directory-picker-browse/)
  }
})

test('structured fields render the complete meeting recap contract', () => {
  const recap = renderStructuredMeetingRecap({
    title: '结构化会议复盘测试',
    meetingTopic: '确认输入与输出合同。',
    keyDiscussions: ['Markdown 是内容真源。'],
    confirmedDecisions: ['发送前必须批准。'],
    todoItems: ['负责人待确认；时间待确认。'],
    pendingQuestions: ['真实飞书测试群尚未验收。'],
    groupSummary: '本次只验证结构，不发送。',
  })
  assert.match(recap, /^# 结构化会议复盘测试/m)
  assert.equal(recap.endsWith('状态：未发送。\n'), true)
})

test('text route normalizes and reloads the complete transcript with a hash', async () => {
  await withWorkspace(async workspace => {
    const normalized = await normalizeTranscriptFile({
      workspace,
      inputPath: 'examples/input/sample-meeting.md',
    })
    assert.equal(normalized.output_path, 'runtime/normalized-transcript.md')
    const loaded = await loadNormalizedTranscript({ workspace })
    assert.equal(loaded.characters > 100, true)
    assert.match(loaded.source_hash, /^[a-f0-9]{64}$/)
    assert.match(loaded.transcript, /体验用户由谁邀请还没有定/)
  })
})

test('save_meeting_recap requires this Harness session to load the current transcript first', async () => {
  await withWorkspace(async workspace => {
    await normalizeTranscriptFile({
      workspace,
      inputPath: 'examples/input/sample-meeting.md',
    })
    const definitions = createToolDefinitions({ asrCli: fakeAsrCli })
    const loadTool = definitions.find(tool => tool.name === 'load_normalized_transcript')
    const saveTool = definitions.find(tool => tool.name === 'save_meeting_recap')
    const session = { header: { cwd: workspace } }
    const exec = { agent: { session } }
    const args = {
      title: '会话绑定测试',
      meeting_topic: '检查读取与保存顺序。',
      key_discussions: ['先读取当前标准逐字稿。'],
      confirmed_decisions: ['哈希不由模型复制。'],
      todo_items: ['继续检查派生产物。'],
      pending_questions: ['真实飞书仍待验收。'],
      group_summary: '本次只验证会话绑定。',
    }

    await assert.rejects(
      saveTool.execute(args, { agent: { session: { header: { cwd: workspace } } } }),
      /load_normalized_transcript must succeed in this session/,
    )
    await loadTool.execute({}, exec)
    const saved = await saveTool.execute(args, exec)
    assert.equal(saved.output_path, 'runtime/meeting-recap.md')
  })
})

test('workspace path guard blocks paths outside the selected workspace', async () => {
  await withWorkspace(async workspace => {
    await assert.rejects(
      normalizeTranscriptFile({ workspace, inputPath: '../../private-meeting.md' }),
      /path escapes the selected workspace/,
    )
  })
})

test('the checked example recap is valid and produces a Feishu card', async () => {
  await withWorkspace(async workspace => {
    assert.equal(validateMeetingRecap(expectedRecap).endsWith('状态：未发送。\n'), true)
    await saveMeetingRecap({ workspace, markdown: expectedRecap })
    const card = await prepareFeishuCard({ workspace })
    assert.equal(card.msg_type, 'interactive')
    assert.equal(buildFeishuCard(expectedRecap).card.header.title.content, 'Beta 反馈页联调会复盘')
  })
})

test('Hook asks only for the fixed test destination and protects pipeline artifacts', () => {
  assert.equal(
    decidePublish({ name: 'publish_feishu_card', arguments: { destination: 'production-group' } }).kind,
    'deny',
  )
  assert.equal(
    decidePublish({ name: 'publish_feishu_card', arguments: { destination: 'feishu-test-group' } }).kind,
    'ask',
  )
  assert.equal(decidePublish({ name: 'normalize_transcript', arguments: {} }), undefined)
  assert.equal(decideProtectedArtifactWrite({
    name: 'write',
    arguments: { file_path: 'runtime/meeting-recap.md' },
  }).kind, 'deny')
  assert.equal(decideProtectedArtifactWrite({
    name: 'str_replace_editor',
    arguments: { path: './runtime/feishu-card.json' },
  }).kind, 'deny')
  assert.equal(decideProtectedArtifactWrite({
    name: 'write',
    arguments: { file_path: 'notes.md' },
  }), undefined)
})

test('Mock delivery writes a receipt only after the receiver accepts the card', async () => {
  await withWorkspace(async workspace => {
    await saveMeetingRecap({ workspace, markdown: expectedRecap })
    await prepareFeishuCard({ workspace })
    const mock = await startMockFeishuWebhook({ port: 0 })
    try {
      process.env.MEETING_RECAP_TEST_WEBHOOK = mock.webhookUrl
      const receipt = await publishFeishuCard({
        workspace,
        destination: 'feishu-test-group',
        webhookEnv: 'MEETING_RECAP_TEST_WEBHOOK',
        allowLoopback: true,
      })
      assert.equal(receipt.delivered, true)
      assert.equal(receipt.delivery_mode, 'mock')
      assert.equal(mock.latestPayload()?.msg_type, 'interactive')
      assert.equal((await stat(join(workspace, 'runtime', 'feishu-receipt.json'))).isFile(), true)
    } finally {
      delete process.env.MEETING_RECAP_TEST_WEBHOOK
      await mock.close()
    }
  })
})

test('receiver rejection leaves no success receipt', async () => {
  await withWorkspace(async workspace => {
    await saveMeetingRecap({ workspace, markdown: expectedRecap })
    await prepareFeishuCard({ workspace })
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) { /* drain request body */ }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ code: 19001, msg: 'mock-rejected' }))
    })
    await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
    const address = server.address()
    try {
      process.env.MEETING_RECAP_REJECT_WEBHOOK = `http://127.0.0.1:${address.port}/reject`
      await assert.rejects(
        publishFeishuCard({
          workspace,
          destination: 'feishu-test-group',
          webhookEnv: 'MEETING_RECAP_REJECT_WEBHOOK',
          allowLoopback: true,
        }),
        /Feishu rejected the card/,
      )
      await assert.rejects(access(join(workspace, 'runtime', 'feishu-receipt.json')))
    } finally {
      delete process.env.MEETING_RECAP_REJECT_WEBHOOK
      await new Promise((resolvePromise, rejectPromise) => {
        server.close(error => error ? rejectPromise(error) : resolvePromise())
      })
    }
  })
})

test('PDF route renders the same checked Markdown', { skip: !hasWeasyPrint }, async () => {
  await withWorkspace(async workspace => {
    await saveMeetingRecap({ workspace, markdown: expectedRecap })
    const pdf = await exportMeetingRecapPdf({ workspace })
    assert.equal(pdf.bytes > 1_000, true)
    const header = (await readFile(join(workspace, pdf.output_path))).subarray(0, 5).toString()
    assert.equal(header, '%PDF-')
    if (hasPdfInfo) {
      const info = await runFile('pdfinfo', [join(workspace, pdf.output_path)])
      assert.match(info.stdout, /^Pages:\s+1$/m)
    }
  })
})

test('optional media adapter returns audio and video to one transcript contract', {
  skip: !(hasFfmpeg && hasFfprobe),
}, async () => {
  await withWorkspace(async workspace => {
    await runFile('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1',
      '-ar', '16000', '-ac', '1', join(workspace, 'examples', 'input', 'audio.wav'),
    ])
    const audio = await transcribeMediaFile({
      workspace,
      inputPath: 'examples/input/audio.wav',
      outputPath: 'runtime/audio-normalized-transcript.md',
      transcriptJsonPath: 'runtime/audio-transcript.json',
      asrCli: fakeAsrCli,
      provider: 'test adapter',
    })
    assert.equal(audio.media_kind, 'audio')
    assert.equal(audio.segments, 2)

    await runFile('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=0x0a3472:s=640x360:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1',
      '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac',
      join(workspace, 'examples', 'input', 'video.mp4'),
    ])
    const video = await transcribeMediaFile({
      workspace,
      inputPath: 'examples/input/video.mp4',
      outputPath: 'runtime/video-normalized-transcript.md',
      transcriptJsonPath: 'runtime/video-transcript.json',
      asrCli: fakeAsrCli,
      provider: 'test adapter',
    })
    assert.equal(video.media_kind, 'video')
    assert.match(await readFile(join(workspace, video.output_path), 'utf8'), /输入类型：视频/)
  })
})
