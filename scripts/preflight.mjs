import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function commandVersion(command, args = ['--version']) {
  return new Promise(resolvePromise => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) return resolvePromise(null)
      resolvePromise(String(stdout || stderr).trim().split('\n')[0])
    })
  })
}

const requiredFiles = [
  '.dsh/skills/meeting-recap/SKILL.md',
  'plugin/index.mjs',
  'examples/input/sample-meeting.md',
  'examples/expected/meeting-recap.md',
  'cordis.mock.yml',
]

let failed = false
for (const relativePath of requiredFiles) {
  try {
    await access(resolve(root, relativePath))
    console.log(`PASS required file: ${relativePath}`)
  } catch {
    failed = true
    console.error(`FAIL missing file: ${relativePath}`)
  }
}

const skillPath = resolve(root, '.dsh/skills/meeting-recap/SKILL.md')
const skill = await readFile(skillPath, 'utf8')
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] || ''
if (/^name: meeting-recap$/m.test(frontmatter) && /^description: .+$/m.test(frontmatter)) {
  console.log('PASS Skill frontmatter: meeting-recap')
} else {
  failed = true
  console.error('FAIL Skill frontmatter is missing name or description')
}

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor >= 20) console.log(`PASS Node.js: ${process.version}`)
else {
  failed = true
  console.error(`FAIL Node.js 20 or newer is required; found ${process.version}`)
}

const optionalCommands = [
  ['weasyprint', ['--version'], 'PDF route'],
  ['ffprobe', ['-version'], 'media inspection'],
  ['ffmpeg', ['-version'], 'video audio extraction'],
]
for (const [command, args, purpose] of optionalCommands) {
  const version = await commandVersion(command, args)
  if (version) console.log(`PASS optional ${purpose}: ${version}`)
  else console.log(`SKIP optional ${purpose}: ${command} is not installed`)
}

if (failed) process.exitCode = 1
