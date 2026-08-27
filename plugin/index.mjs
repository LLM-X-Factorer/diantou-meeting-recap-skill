import {
  decideProtectedArtifactWrite,
  decidePublish,
  exportMeetingRecapPdf,
  loadNormalizedTranscript,
  normalizeTranscriptFile,
  prepareFeishuCard,
  publishFeishuCard,
  renderStructuredMeetingRecap,
  saveMeetingRecap,
  transcribeMediaFile,
} from './lib/index.mjs'

export const name = 'diantou-meeting-recap'
export const inject = ['tools']

// This file is the model-visible surface: names, descriptions, schemas and the
// Hook. Deterministic file and rendering logic lives in plugin/lib so learners
// can read each responsibility without crossing a 700-line source file.
const objectOutput = properties => ({
  schema: { type: 'object', properties, additionalProperties: false },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

const pathProperty = description => ({ type: 'string', description })
const nonEmptyText = description => ({ type: 'string', minLength: 1, description })
const nonEmptyList = description => ({
  type: 'array',
  minItems: 1,
  items: { type: 'string', minLength: 1 },
  description,
})

// The hash belongs to the live Harness session. It is intentionally not placed
// in a model argument or a tracked file that could be copied from an older run.
const loadedTranscriptBySession = new WeakMap()

function workspaceFrom(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') {
    throw new Error('tool requires an agent session workspace')
  }
  return cwd
}

function sessionFrom(exec) {
  const session = exec?.agent?.session
  if (!session || (typeof session !== 'object' && typeof session !== 'function')) {
    throw new Error('tool requires an agent session')
  }
  return session
}

export function createToolDefinitions(config = {}) {
  const webhookEnv = config.webhookEnv || 'FEISHU_TEST_WEBHOOK_URL'
  const allowLoopback = config.allowLoopback === true
  const asrCli = config.asrCli || process.env.MEETING_ASR_CLI
  const asrProvider = config.asrProvider || process.env.MEETING_ASR_PROVIDER || 'configured ASR adapter'

  return [
    {
      name: 'normalize_transcript',
      description: '用于 .md 或 .txt 逐字稿。把工作区内的文本规范化为统一逐字稿；文本文件不要交给 transcribe_media。',
      parameters: {
        type: 'object',
        properties: {
          input_path: pathProperty('工作区内的逐字稿路径。'),
          output_path: pathProperty('默认写入 runtime/normalized-transcript.md。'),
        },
        required: ['input_path'],
        additionalProperties: false,
      },
      output: objectOutput({
        source_path: { type: 'string' },
        output_path: { type: 'string' },
        characters: { type: 'integer' },
      }),
      execute: (args, exec) => normalizeTranscriptFile({
        workspace: workspaceFrom(exec),
        inputPath: args.input_path,
        outputPath: args.output_path,
      }),
    },
    {
      name: 'load_normalized_transcript',
      description: '完整读取标准逐字稿并记录本次会话的内容哈希。生成复盘前必须调用。',
      parameters: {
        type: 'object',
        properties: {
          input_path: pathProperty('默认读取 runtime/normalized-transcript.md。'),
        },
        additionalProperties: false,
      },
      output: objectOutput({
        input_path: { type: 'string' },
        source_hash: { type: 'string' },
        characters: { type: 'integer' },
        transcript: { type: 'string' },
      }),
      execute: async (args, exec) => {
        const result = await loadNormalizedTranscript({
          workspace: workspaceFrom(exec),
          inputPath: args.input_path,
        })
        loadedTranscriptBySession.set(sessionFrom(exec), result.source_hash)
        return result
      },
    },
    {
      name: 'transcribe_media',
      description: '只用于已获上传授权的音频或视频。调用配置好的 ASR 适配器，写入标准逐字稿和审计 JSON。',
      parameters: {
        type: 'object',
        properties: {
          input_path: pathProperty('工作区内的音频或视频路径。'),
          output_path: pathProperty('默认写入 runtime/normalized-transcript.md。'),
          transcript_json_path: pathProperty('默认写入 runtime/media-transcript.json。'),
          language: { type: 'string', description: '语言提示，默认 zh。' },
        },
        required: ['input_path'],
        additionalProperties: false,
      },
      output: objectOutput({
        source_path: { type: 'string' },
        media_kind: { type: 'string', enum: ['audio', 'video'] },
        provider: { type: 'string' },
        output_path: { type: 'string' },
        transcript_json_path: { type: 'string' },
        segments: { type: 'integer' },
        characters: { type: 'integer' },
      }),
      execute: (args, exec) => transcribeMediaFile({
        workspace: workspaceFrom(exec),
        inputPath: args.input_path,
        outputPath: args.output_path,
        transcriptJsonPath: args.transcript_json_path,
        language: args.language || 'zh',
        asrCli,
        provider: asrProvider,
        signal: exec.signal,
      }),
    },
    {
      name: 'save_meeting_recap',
      description: '根据本次会话已经读取的逐字稿保存结构化会议复盘。Tool 固定标题顺序和未发送状态。',
      parameters: {
        type: 'object',
        properties: {
          title: nonEmptyText('不含 Markdown # 的具体标题。'),
          meeting_topic: nonEmptyText('这场会议解决或讨论的主题。'),
          key_discussions: nonEmptyList('从逐字稿提炼的关键讨论。'),
          confirmed_decisions: nonEmptyList('只填写逐字稿明确确认的决定。'),
          todo_items: nonEmptyList('保留负责人或日期未知状态的待办。'),
          pending_questions: nonEmptyList('仍未确认的问题。'),
          group_summary: nonEmptyText('适合群内阅读的简短摘要。'),
          output_path: pathProperty('默认写入 runtime/meeting-recap.md。'),
        },
        required: [
          'title',
          'meeting_topic',
          'key_discussions',
          'confirmed_decisions',
          'todo_items',
          'pending_questions',
          'group_summary',
        ],
        additionalProperties: false,
      },
      output: objectOutput({
        output_path: { type: 'string' },
        characters: { type: 'integer' },
        sections: { type: 'integer' },
        status: { type: 'string' },
      }),
      execute: async (args, exec) => {
        const workspace = workspaceFrom(exec)
        const session = sessionFrom(exec)
        const loadedHash = loadedTranscriptBySession.get(session)
        if (!loadedHash) {
          throw new Error('load_normalized_transcript must succeed in this session before save_meeting_recap')
        }

        const current = await loadNormalizedTranscript({ workspace })
        if (current.source_hash !== loadedHash) {
          throw new Error('runtime/normalized-transcript.md changed after loading; load it again before saving')
        }

        return saveMeetingRecap({
          workspace,
          markdown: renderStructuredMeetingRecap({
            title: args.title,
            meetingTopic: args.meeting_topic,
            keyDiscussions: args.key_discussions,
            confirmedDecisions: args.confirmed_decisions,
            todoItems: args.todo_items,
            pendingQuestions: args.pending_questions,
            groupSummary: args.group_summary,
          }),
          outputPath: args.output_path,
        })
      },
    },
    {
      name: 'export_recap_pdf',
      description: '从已验证的 meeting-recap.md 渲染 A4 PDF，不让模型重新概括。',
      parameters: {
        type: 'object',
        properties: {
          input_path: pathProperty('默认读取 runtime/meeting-recap.md。'),
          output_path: pathProperty('默认写入 runtime/meeting-recap.pdf。'),
        },
        additionalProperties: false,
      },
      output: objectOutput({
        input_path: { type: 'string' },
        output_path: { type: 'string' },
        bytes: { type: 'integer' },
      }),
      execute: (args, exec) => exportMeetingRecapPdf({
        workspace: workspaceFrom(exec),
        inputPath: args.input_path,
        outputPath: args.output_path,
        signal: exec.signal,
      }),
    },
    {
      name: 'prepare_feishu_card',
      description: '从已验证的 meeting-recap.md 生成飞书互动卡片 JSON，但不发送。',
      parameters: {
        type: 'object',
        properties: {
          input_path: pathProperty('默认读取 runtime/meeting-recap.md。'),
          output_path: pathProperty('默认写入 runtime/feishu-card.json。'),
        },
        additionalProperties: false,
      },
      output: objectOutput({
        input_path: { type: 'string' },
        output_path: { type: 'string' },
        msg_type: { type: 'string' },
        title: { type: 'string' },
      }),
      execute: (args, exec) => prepareFeishuCard({
        workspace: workspaceFrom(exec),
        inputPath: args.input_path,
        outputPath: args.output_path,
      }),
    },
    {
      name: 'publish_feishu_card',
      description: '把已准备的卡片发送到配置好的飞书测试群；发送前必须经过 Harness 批准。',
      parameters: {
        type: 'object',
        properties: {
          card_path: pathProperty('默认读取 runtime/feishu-card.json。'),
          receipt_path: pathProperty('成功后默认写入 runtime/feishu-receipt.json。'),
          destination: {
            type: 'string',
            enum: ['feishu-test-group'],
            description: '固定测试目标。',
          },
        },
        required: ['destination'],
        additionalProperties: false,
      },
      output: objectOutput({
        destination: { type: 'string' },
        delivered: { type: 'boolean' },
        http_status: { type: 'integer' },
        delivery_mode: { type: 'string', enum: ['mock', 'feishu'] },
        provider_code: { oneOf: [{ type: 'integer' }, { type: 'string' }, { type: 'null' }] },
        provider_message: { type: 'string' },
        card_path: { type: 'string' },
        sent_at: { type: 'string' },
        receipt_path: { type: 'string' },
      }),
      execute: (args, exec) => publishFeishuCard({
        workspace: workspaceFrom(exec),
        cardPath: args.card_path,
        receiptPath: args.receipt_path,
        destination: args.destination,
        webhookEnv,
        allowLoopback,
        signal: exec.signal,
      }),
    },
  ]
}

export { decideProtectedArtifactWrite, decidePublish }

export function apply(ctx, config = {}) {
  for (const definition of createToolDefinitions(config)) {
    ctx.tools.register(definition)
  }

  const approvalMode = config.approvalMode || 'ask'
  ctx.on('tools/pre-execute', async (exec, next) => {
    const artifactDecision = decideProtectedArtifactWrite(exec)
    if (artifactDecision !== undefined) return artifactDecision

    const publishDecision = decidePublish(exec, approvalMode)
    if (publishDecision === undefined || publishDecision.kind === 'allow') return next()
    return publishDecision
  })
}
