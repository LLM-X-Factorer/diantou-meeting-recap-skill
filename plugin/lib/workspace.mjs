import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

export const DEFAULT_MAX_TEXT_BYTES = 2 * 1024 * 1024
export const DEFAULT_MAX_TRANSCRIPT_JSON_BYTES = 32 * 1024 * 1024

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

/**
 * Tool arguments are model-controlled. Resolve every path under the selected
 * workspace so a prompt cannot turn this teaching plugin into an arbitrary
 * host-file reader or writer.
 */
export async function resolveWorkspacePath(workspace, requestedPath, { mustExist = false } = {}) {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    throw new TypeError('path must be a non-empty string')
  }

  const workspaceReal = await realpath(workspace)
  const candidate = resolve(workspaceReal, requestedPath)
  if (!isWithin(workspaceReal, candidate)) {
    throw new Error(`path escapes the selected workspace: ${requestedPath}`)
  }

  if (mustExist) {
    let candidateReal
    try {
      candidateReal = await realpath(candidate)
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`input file does not exist: ${requestedPath}`)
      throw error
    }
    if (!isWithin(workspaceReal, candidateReal)) {
      throw new Error(`path resolves outside the selected workspace: ${requestedPath}`)
    }
    return candidateReal
  }

  // Check the nearest existing parent as well. Without this check, a symlinked
  // parent directory could redirect a future output outside the workspace.
  let existing = dirname(candidate)
  while (existing !== workspaceReal) {
    try {
      await stat(existing)
      break
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = dirname(existing)
      if (parent === existing) break
      existing = parent
    }
  }
  const existingReal = await realpath(existing)
  if (!isWithin(workspaceReal, existingReal)) {
    throw new Error(`output parent resolves outside the selected workspace: ${requestedPath}`)
  }
  return candidate
}

export async function readBoundedText(path, maxBytes = DEFAULT_MAX_TEXT_BYTES) {
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new Error('input is not a regular file')
  if (metadata.size > maxBytes) throw new Error(`input exceeds ${maxBytes} bytes`)
  return readFile(path, 'utf8')
}

/** Write through a sibling temporary file so a failed process leaves no half file. */
export async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = join(dirname(path), `.${randomUUID()}.tmp`)
  await writeFile(temporaryPath, content)
  await rename(temporaryPath, path)
}

export function runFile(command, args, { signal, maxBuffer = 8 * 1024 * 1024, cwd } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer, signal, cwd }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim().slice(0, 2_000)
        rejectPromise(new Error(`${command} failed: ${detail}`))
        return
      }
      resolvePromise({ stdout, stderr })
    })
  })
}

export async function workspaceRelative(workspace, path) {
  return relative(await realpath(workspace), path) || '.'
}
