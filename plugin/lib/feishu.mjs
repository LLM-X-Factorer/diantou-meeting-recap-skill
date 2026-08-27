import { validateMeetingRecap } from './recap.mjs'
import { atomicWrite, readBoundedText, resolveWorkspacePath, workspaceRelative } from './workspace.mjs'

const DEFAULT_MAX_CARD_CHARS = 12_000

function extractH1(markdown) {
  return markdown.match(/^# ([^\n]+)/m)?.[1]?.trim() || '会议复盘'
}

export function buildFeishuCard(markdown, { maxChars = DEFAULT_MAX_CARD_CHARS } = {}) {
  const validated = validateMeetingRecap(markdown)
  const content = validated.length > maxChars
    ? `${validated.slice(0, maxChars - 16)}\n\n……内容已截断`
    : validated
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: extractH1(validated) },
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content } },
        { tag: 'hr' },
        {
          tag: 'note',
          elements: [{
            tag: 'plain_text',
            content: '由 meeting-recap 教学示例生成；真实发送前必须人工批准。',
          }],
        },
      ],
    },
  }
}

export async function prepareFeishuCard({
  workspace,
  inputPath = 'runtime/meeting-recap.md',
  outputPath = 'runtime/feishu-card.json',
}) {
  const source = await resolveWorkspacePath(workspace, inputPath, { mustExist: true })
  const output = await resolveWorkspacePath(workspace, outputPath)
  const card = buildFeishuCard(await readBoundedText(source))
  await atomicWrite(output, `${JSON.stringify(card, null, 2)}\n`)
  return {
    input_path: await workspaceRelative(workspace, source),
    output_path: await workspaceRelative(workspace, output),
    msg_type: card.msg_type,
    title: card.card.header.title.content,
  }
}

function validateWebhook(urlString, { allowLoopback = false } = {}) {
  const url = new URL(urlString)
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  if (loopback && allowLoopback && url.protocol === 'http:') return url
  if (url.protocol !== 'https:') throw new Error('Feishu webhook must use HTTPS')
  if (url.hostname !== 'open.feishu.cn' && url.hostname !== 'open.larksuite.com') {
    throw new Error('Feishu webhook host is not allowlisted')
  }
  return url
}

function providerOutcome(payload) {
  const code = payload?.code ?? payload?.StatusCode
  const message = payload?.msg ?? payload?.StatusMessage ?? ''
  return { code, message: String(message).slice(0, 300) }
}

export async function publishFeishuCard({
  workspace,
  cardPath = 'runtime/feishu-card.json',
  receiptPath = 'runtime/feishu-receipt.json',
  destination,
  webhookEnv = 'FEISHU_TEST_WEBHOOK_URL',
  allowLoopback = false,
  signal,
}) {
  if (destination !== 'feishu-test-group') {
    throw new Error('destination must be feishu-test-group')
  }
  const webhookValue = process.env[webhookEnv]
  if (!webhookValue) throw new Error(`${webhookEnv} is not configured`)
  const webhook = validateWebhook(webhookValue, { allowLoopback })
  const deliveryMode = ['127.0.0.1', 'localhost', '::1'].includes(webhook.hostname)
    ? 'mock'
    : 'feishu'

  const source = await resolveWorkspacePath(workspace, cardPath, { mustExist: true })
  const output = await resolveWorkspacePath(workspace, receiptPath)
  const card = JSON.parse(await readBoundedText(source))
  if (card?.msg_type !== 'interactive' || typeof card?.card !== 'object') {
    throw new Error('card payload is not a Feishu interactive message')
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(card),
    signal,
  })
  const responseText = await response.text()
  let responseJson
  try {
    responseJson = responseText === '' ? {} : JSON.parse(responseText)
  } catch {
    throw new Error(`Feishu returned non-JSON HTTP ${response.status}`)
  }

  const provider = providerOutcome(responseJson)
  const delivered = response.ok && (provider.code === 0 || provider.code === '0')
  if (!delivered) {
    // A rejected request is useful error evidence, but it is not a delivery
    // receipt. Leaving the file absent makes that distinction inspectable.
    throw new Error(`Feishu rejected the card: HTTP ${response.status}, code ${String(provider.code)}`)
  }

  const receipt = {
    destination,
    delivered: true,
    delivery_mode: deliveryMode,
    http_status: response.status,
    provider_code: provider.code ?? null,
    provider_message: provider.message,
    card_path: await workspaceRelative(workspace, source),
    sent_at: new Date().toISOString(),
  }
  await atomicWrite(output, `${JSON.stringify(receipt, null, 2)}\n`)
  return {
    ...receipt,
    receipt_path: await workspaceRelative(workspace, output),
  }
}
