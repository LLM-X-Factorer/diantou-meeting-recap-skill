import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_PATH = '/open-apis/bot/v2/hook/meeting-recap-demo'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
}

export function renderLarkMarkdown(value) {
  const output = []
  let listItems = []
  const flushList = () => {
    if (listItems.length === 0) return
    output.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`)
    listItems = []
  }
  for (const rawLine of String(value).replaceAll('\r\n', '\n').split('\n')) {
    const line = rawLine.trim()
    if (line === '') {
      flushList()
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushList()
      const level = heading[1].length
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }
    const listItem = line.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      listItems.push(renderInlineMarkdown(listItem[1]))
      continue
    }
    flushList()
    output.push(`<p>${renderInlineMarkdown(line)}</p>`)
  }
  flushList()
  return output.join('\n')
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, content)
  await rename(temporary, path)
}

function readCard(payload) {
  if (payload?.msg_type !== 'interactive' || typeof payload?.card !== 'object') {
    throw new Error('payload must be a Feishu interactive card')
  }
  const title = payload?.card?.header?.title?.content
  if (typeof title !== 'string' || title.trim() === '') throw new Error('card title is required')
  const elements = []
  for (const element of payload?.card?.elements || []) {
    if (element?.tag === 'hr') {
      elements.push({ tag: 'hr' })
      continue
    }
    if (element?.tag === 'note') {
      const note = (element?.elements || [])
        .map(item => item?.content)
        .filter(value => typeof value === 'string')
        .join(' ')
      if (note) elements.push({ tag: 'note', content: note })
      continue
    }
    const text = element?.text
    if (typeof text?.content === 'string') {
      elements.push({
        tag: text.tag === 'lark_md' ? 'lark_md' : 'plain_text',
        content: text.content,
      })
    }
  }
  const content = elements
    .map(element => element.content)
    .filter(value => typeof value === 'string')
    .join('\n\n')
  return { title: title.trim(), content, elements }
}

function renderCardElements(card) {
  if (!Array.isArray(card?.elements) || card.elements.length === 0) {
    return renderLarkMarkdown(card?.content || '')
  }
  return card.elements.map(element => {
    if (element.tag === 'hr') return '<hr>'
    if (element.tag === 'note') return `<aside>${escapeHtml(element.content)}</aside>`
    if (element.tag === 'lark_md') return renderLarkMarkdown(element.content)
    return `<p>${escapeHtml(element.content)}</p>`
  }).join('\n')
}

async function restoreLatest(outputDir) {
  if (!outputDir) return null
  try {
    const stored = JSON.parse(await readFile(join(outputDir, 'latest-request.json'), 'utf8'))
    if (!stored?.payload) return null
    return { ...stored, card: readCard(stored.payload) }
  } catch {
    return null
  }
}

function renderInbox(latest, count) {
  const card = latest?.card
  const title = card?.title || '还没有收到卡片'
  const content = card
    ? renderCardElements(card)
    : '<p>在 Harness 中批准 <code>publish_feishu_card</code> 后，这里会出现会议复盘卡片。</p>'
  const receivedAt = latest?.received_at || '等待中'
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>meeting-recap Mock 飞书群</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2329;background:#f5f6f7}
body{margin:0;padding:44px}.shell{max-width:980px;margin:auto}.eyebrow{color:#0a3472;font-weight:700;letter-spacing:.08em}
h1{font-size:38px;margin:8px 0 10px}.meta{color:#646a73;margin-bottom:28px}.card{background:white;border-radius:16px;box-shadow:0 12px 36px rgba(10,52,114,.12);overflow:hidden}
.header{background:#0a3472;color:white;padding:22px 28px;border-left:10px solid #ffc107;font-size:25px;font-weight:700}
.content{padding:28px;font-size:18px;line-height:1.7}.content h1{font-size:28px;margin:0 0 20px}.content h2{font-size:23px;margin:28px 0 10px;color:#0a3472}.content p{margin:10px 0}.content ul{margin:10px 0;padding-left:26px}.content li{margin:7px 0}.content code{background:#f2f3f5;border-radius:5px;padding:2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}.content hr{border:0;border-top:1px solid #e5e6eb;margin:28px 0}.content aside{background:#f5f6f7;color:#646a73;border-radius:8px;padding:12px 14px;font-size:15px}.footer{padding:16px 28px;border-top:1px solid #e5e6eb;color:#646a73;font-size:14px}
.mock{display:inline-block;background:#fff3c4;color:#7a5600;border-radius:999px;padding:5px 12px;font-weight:700;margin-left:8px}
</style></head><body><main class="shell"><div class="eyebrow">MEETING RECAP RECEIVER <span class="mock">MOCK</span></div>
<h1>飞书测试群 · 本机替身</h1><div class="meta">已接收 ${count} 次请求 · 最近接收：${escapeHtml(receivedAt)}</div>
<section class="card"><div class="header">${escapeHtml(title)}</div><div class="content">${content}</div>
<div class="footer">仅用于本机演示，不代表消息已经进入真实飞书。</div></section></main></body></html>`
}

export async function startMockFeishuWebhook({
  host = '127.0.0.1',
  port = 3099,
  webhookPath = DEFAULT_PATH,
  outputDir,
} = {}) {
  let latest = await restoreLatest(outputDir)
  let count = latest ? Math.max(1, Number.parseInt(String(latest.request_id || '').replace(/^mock-/, ''), 10) || 1) : 0
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${host}`)
      if (request.method === 'GET' && url.pathname === '/healthz') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ ok: true, mode: 'mock', received: count }))
        return
      }
      if (request.method === 'GET' && url.pathname === '/inbox') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(renderInbox(latest, count))
        return
      }
      if (request.method !== 'POST' || url.pathname !== webhookPath) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ code: 404, msg: 'mock endpoint not found' }))
        return
      }
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const card = readCard(payload)
      count += 1
      latest = {
        mode: 'mock',
        request_id: `mock-${String(count).padStart(3, '0')}`,
        received_at: new Date().toISOString(),
        card,
        payload,
      }
      if (outputDir) {
        await atomicWrite(join(outputDir, 'latest-request.json'), `${JSON.stringify(latest, null, 2)}\n`)
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ code: 0, msg: 'mock-success', data: { request_id: latest.request_id } }))
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ code: 400, msg: String(error?.message || error) }))
    }
  })
  await new Promise(resolvePromise => server.listen(port, host, resolvePromise))
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  return {
    webhookUrl: `http://${host}:${actualPort}${webhookPath}`,
    inboxUrl: `http://${host}:${actualPort}/inbox`,
    healthUrl: `http://${host}:${actualPort}/healthz`,
    latestPayload: () => latest?.payload,
    close: () => new Promise((resolvePromise, rejectPromise) => server.close(error => error ? rejectPromise(error) : resolvePromise())),
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const mock = await startMockFeishuWebhook({
    host: process.env.MOCK_FEISHU_HOST || '127.0.0.1',
    port: Number(process.env.MOCK_FEISHU_PORT || 3099),
    outputDir: process.env.MOCK_FEISHU_OUTPUT_DIR || join(repositoryRoot, 'runtime', 'mock-feishu'),
  })
  process.stdout.write(`${JSON.stringify({ mode: 'mock', webhook_url: mock.webhookUrl, inbox_url: mock.inboxUrl })}\n`)
  const shutdown = async () => {
    await mock.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
