import { realpath } from 'node:fs/promises'
import { relative } from 'node:path'

import { atomicWrite, resolveWorkspacePath } from './workspace.mjs'
import { normalizeTranscriptText } from './transcript.mjs'

export const REQUIRED_RECAP_SECTIONS = [
  '## 会议主题',
  '## 关键讨论',
  '## 已确认决定',
  '## 待办事项',
  '## 待确认问题',
  '## 群内发布摘要',
]

export function validateMeetingRecap(markdown) {
  if (typeof markdown !== 'string' || markdown.trim() === '') {
    throw new Error('meeting recap markdown is empty')
  }
  if (!/^# [^#\n]+/m.test(markdown)) {
    throw new Error('meeting recap must start with one concrete H1 title')
  }

  // Order matters: downstream renderers can trust one stable document contract.
  let cursor = -1
  for (const heading of REQUIRED_RECAP_SECTIONS) {
    const next = markdown.indexOf(heading)
    if (next < 0) throw new Error(`meeting recap is missing required section: ${heading}`)
    if (next <= cursor) throw new Error(`meeting recap sections are out of order at: ${heading}`)
    cursor = next
  }

  if (!/状态：未发送。?\s*$/u.test(markdown.trim())) {
    throw new Error('meeting recap must end with 状态：未发送。')
  }
  return normalizeTranscriptText(markdown)
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be non-empty text`)
  }
  return value.trim()
}

function requiredList(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must contain at least one item`)
  }
  return value.map((item, index) => requiredText(item, `${field}[${index}]`))
}

/**
 * The model supplies facts; this deterministic renderer owns headings, order
 * and the unsent status. That division prevents a fluent answer from silently
 * dropping the part learners are supposed to inspect.
 */
export function renderStructuredMeetingRecap({
  title,
  meetingTopic,
  keyDiscussions,
  confirmedDecisions,
  todoItems,
  pendingQuestions,
  groupSummary,
}) {
  const concreteTitle = requiredText(title, 'title').replace(/^#+\s*/u, '')
  const renderList = items => items.map(item => `- ${item}`).join('\n')
  return validateMeetingRecap([
    `# ${concreteTitle}`,
    '',
    '## 会议主题',
    '',
    requiredText(meetingTopic, 'meeting_topic'),
    '',
    '## 关键讨论',
    '',
    renderList(requiredList(keyDiscussions, 'key_discussions')),
    '',
    '## 已确认决定',
    '',
    renderList(requiredList(confirmedDecisions, 'confirmed_decisions')),
    '',
    '## 待办事项',
    '',
    renderList(requiredList(todoItems, 'todo_items')),
    '',
    '## 待确认问题',
    '',
    renderList(requiredList(pendingQuestions, 'pending_questions')),
    '',
    '## 群内发布摘要',
    '',
    requiredText(groupSummary, 'group_summary'),
    '',
    '状态：未发送。',
  ].join('\n'))
}

export async function saveMeetingRecap({
  workspace,
  markdown,
  outputPath = 'runtime/meeting-recap.md',
}) {
  const output = await resolveWorkspacePath(workspace, outputPath)
  const validated = validateMeetingRecap(markdown)
  await atomicWrite(output, validated)
  return {
    output_path: relative(await realpath(workspace), output) || '.',
    characters: validated.length,
    sections: REQUIRED_RECAP_SECTIONS.length,
    status: '未发送',
  }
}
