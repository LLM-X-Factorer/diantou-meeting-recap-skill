import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import {
  atomicWrite,
  DEFAULT_MAX_TRANSCRIPT_JSON_BYTES,
  readBoundedText,
  resolveWorkspacePath,
  runFile,
  workspaceRelative,
} from './workspace.mjs'

export function normalizeTranscriptText(text) {
  if (typeof text !== 'string') throw new TypeError('transcript must be text')
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

export async function normalizeTranscriptFile({
  workspace,
  inputPath,
  outputPath = 'runtime/normalized-transcript.md',
}) {
  const source = await resolveWorkspacePath(workspace, inputPath, { mustExist: true })
  const output = await resolveWorkspacePath(workspace, outputPath)
  const normalized = normalizeTranscriptText(await readBoundedText(source))
  if (normalized.trim() === '') throw new Error('transcript is empty after normalization')
  await atomicWrite(output, normalized)
  return {
    source_path: await workspaceRelative(workspace, source),
    output_path: await workspaceRelative(workspace, output),
    characters: normalized.length,
  }
}

export async function loadNormalizedTranscript({
  workspace,
  inputPath = 'runtime/normalized-transcript.md',
}) {
  const source = await resolveWorkspacePath(workspace, inputPath, { mustExist: true })
  const transcript = normalizeTranscriptText(await readBoundedText(source))
  return {
    input_path: await workspaceRelative(workspace, source),
    source_hash: createHash('sha256').update(transcript).digest('hex'),
    characters: transcript.length,
    transcript,
  }
}

async function detectMediaKind(path, signal) {
  let result
  try {
    result = await runFile('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', path,
    ], { signal })
  } catch {
    throw new Error('transcribe_media only accepts audio or video; use normalize_transcript for Markdown or text')
  }

  let payload
  try {
    payload = JSON.parse(result.stdout)
  } catch {
    throw new Error('ffprobe returned invalid JSON')
  }
  const streamTypes = new Set((payload.streams || []).map(stream => stream.codec_type))
  if (streamTypes.has('video')) return 'video'
  if (streamTypes.has('audio')) return 'audio'
  throw new Error('input does not contain an audio or video stream')
}

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return '??:??'
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  const core = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${core}` : core
}

function validateAdapterTranscript(payload) {
  if (!payload || !Array.isArray(payload.segments) || payload.segments.length === 0) {
    throw new Error('media transcription adapter returned no transcript segments')
  }
  if (payload.segments.length > 100_000) {
    throw new Error('media transcription adapter returned too many segments')
  }

  const segments = payload.segments.map((segment, index) => {
    const text = typeof segment?.text === 'string' ? segment.text.trim() : ''
    const speaker = typeof segment?.speaker === 'string' ? segment.speaker.trim() : ''
    if (!text) throw new Error(`adapter segment ${index + 1} has no text`)
    if (!speaker) throw new Error(`adapter segment ${index + 1} has no speaker label`)
    return {
      start: Number.isFinite(Number(segment.start)) ? Number(segment.start) : null,
      end: Number.isFinite(Number(segment.end)) ? Number(segment.end) : null,
      speaker,
      text,
    }
  })

  return {
    language: typeof payload.language === 'string' ? payload.language : null,
    duration_seconds: Number.isFinite(Number(payload.duration_seconds))
      ? Number(payload.duration_seconds)
      : null,
    segments,
  }
}

function renderCanonicalMediaTranscript({ sourcePath, mediaKind, provider, transcript }) {
  const lines = [
    '# 标准逐字稿',
    '',
    `- 原始媒体：\`${sourcePath}\``,
    `- 输入类型：${mediaKind === 'video' ? '视频' : '音频'}`,
    `- 转写适配器：${provider}`,
  ]
  if (transcript.language) lines.push(`- 语言：${transcript.language}`)
  if (transcript.duration_seconds !== null) {
    lines.push(`- 时长：${formatTimestamp(transcript.duration_seconds)}`)
  }
  lines.push('- 分说话人：由转写适配器提供', '')
  for (const segment of transcript.segments) {
    lines.push(
      `## [${formatTimestamp(segment.start)}-${formatTimestamp(segment.end)}] ${segment.speaker}`,
      '',
      segment.text,
      '',
    )
  }
  return normalizeTranscriptText(lines.join('\n'))
}

/**
 * The plugin does not own an ASR provider. It calls one executable adapter and
 * accepts only the documented transcript.json contract. This keeps provider
 * credentials and upload policy outside the teaching repository.
 */
export async function transcribeMediaFile({
  workspace,
  inputPath,
  outputPath = 'runtime/normalized-transcript.md',
  transcriptJsonPath = 'runtime/media-transcript.json',
  asrCli,
  provider = 'configured ASR adapter',
  language = 'zh',
  signal,
}) {
  if (!asrCli) throw new Error('MEETING_ASR_CLI is not configured')
  if (!isAbsolute(asrCli)) throw new Error('MEETING_ASR_CLI must be an absolute path')

  const cli = await realpath(asrCli)
  const cliMetadata = await stat(cli)
  if (!cliMetadata.isFile()) throw new Error('MEETING_ASR_CLI is not a regular file')

  const source = await resolveWorkspacePath(workspace, inputPath, { mustExist: true })
  const output = await resolveWorkspacePath(workspace, outputPath)
  const jsonOutput = await resolveWorkspacePath(workspace, transcriptJsonPath)
  const sourcePath = await workspaceRelative(workspace, source)
  const mediaKind = await detectMediaKind(source, signal)
  const tempRoot = await mkdtemp(join(tmpdir(), 'meeting-recap-media-'))

  try {
    // Video and audio intentionally converge here. The downstream recap never
    // needs to know which container originally carried the spoken content.
    const adapterInput = mediaKind === 'video'
      ? join(tempRoot, 'video-audio.mono.16k.mp3')
      : source
    if (mediaKind === 'video') {
      await runFile('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
        '-vn', '-af', 'aresample=async=1000:first_pts=0', '-ac', '1', '-ar', '16000',
        '-acodec', 'libmp3lame', '-b:a', '64k', adapterInput,
      ], { signal })
    }

    const adapterOutput = join(tempRoot, 'adapter-output')
    await mkdir(adapterOutput, { recursive: true })
    await runFile(cli, [
      'transcribe', adapterInput,
      '--output', adapterOutput,
      '--language', language,
      '--diarization', 'provider',
    ], { signal, maxBuffer: 16 * 1024 * 1024 })

    const adapterJsonText = await readBoundedText(
      join(adapterOutput, 'transcript.json'),
      DEFAULT_MAX_TRANSCRIPT_JSON_BYTES,
    )
    let adapterJson
    try {
      adapterJson = JSON.parse(adapterJsonText)
    } catch {
      throw new Error('media transcription adapter returned invalid transcript.json')
    }

    const transcript = validateAdapterTranscript(adapterJson)
    const normalized = renderCanonicalMediaTranscript({ sourcePath, mediaKind, provider, transcript })
    const auditPayload = {
      schema_version: 1,
      source_path: sourcePath,
      media_kind: mediaKind,
      provider,
      language: transcript.language || language,
      duration_seconds: transcript.duration_seconds,
      segments: transcript.segments,
    }
    await atomicWrite(output, normalized)
    await atomicWrite(jsonOutput, `${JSON.stringify(auditPayload, null, 2)}\n`)

    return {
      source_path: sourcePath,
      media_kind: mediaKind,
      provider,
      output_path: await workspaceRelative(workspace, output),
      transcript_json_path: await workspaceRelative(workspace, jsonOutput),
      segments: transcript.segments.length,
      characters: normalized.length,
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
