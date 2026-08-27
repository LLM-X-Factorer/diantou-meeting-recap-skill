export const PROTECTED_PIPELINE_ARTIFACTS = [
  '/runtime/normalized-transcript.md',
  '/runtime/media-transcript.json',
  '/runtime/meeting-recap.md',
  '/runtime/meeting-recap.pdf',
  '/runtime/feishu-card.json',
  '/runtime/feishu-receipt.json',
]

export function decidePublish(exec, approvalMode = 'ask') {
  if (exec.name !== 'publish_feishu_card') return undefined
  if (exec.arguments?.destination !== 'feishu-test-group') {
    return { kind: 'deny', reason: '发布工具只允许飞书测试群。' }
  }
  if (approvalMode === 'deny') {
    return { kind: 'deny', reason: '当前 Profile 禁止外部发送。' }
  }
  if (approvalMode === 'allow') return { kind: 'allow' }
  return {
    kind: 'ask',
    reason: '确认把当前卡片发送到飞书测试群；本次批准仅生效一次。',
  }
}

export function decideProtectedArtifactWrite(exec) {
  if (!['write', 'edit', 'str_replace_editor'].includes(exec.name)) return undefined
  const requested = exec.name === 'str_replace_editor'
    ? exec.arguments?.path
    : exec.arguments?.file_path
  if (typeof requested !== 'string') return undefined

  const normalized = requested.replaceAll('\\', '/')
  const comparable = normalized.startsWith('/')
    ? normalized
    : `/${normalized.replace(/^\.\/+/, '')}`
  if (!PROTECTED_PIPELINE_ARTIFACTS.some(suffix => comparable.endsWith(suffix))) {
    return undefined
  }

  // This Hook protects ownership, not just file names. If a generic editor can
  // rewrite these files, it can bypass the validators taught by this example.
  return {
    kind: 'deny',
    reason: '该文件由会议复盘专用工具管理；请调用 save_meeting_recap、export_recap_pdf、prepare_feishu_card 或 publish_feishu_card。',
  }
}
