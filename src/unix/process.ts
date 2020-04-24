import fs from 'fs'
import util from 'util'

import { isNoProcessForPidError } from './errors'

const fsExistsAsync = util.promisify(fs.exists)
const fsReadFileAsync = util.promisify(fs.readFile)
const fsWriteFileAsync = util.promisify(fs.writeFile)
const fsUnlinkAsync = util.promisify(fs.unlink)

export async function readPidFile(pidFile: string): Promise<number> {
  if (!(await fsExistsAsync(pidFile))) {
    return 0
  }
  const pidFileBuffer = await fsReadFileAsync(pidFile)
  const pidStr = pidFileBuffer.toString('utf8').replace(/\s+$/s, '')
  if (!pidStr.match(/^\d+$/)) {
    return 0
  }
  const pid = parseInt(pidStr, 10)
  return pid
}

export async function isPidRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

export async function isPidFileRunning(pidFile: string): Promise<boolean> {
  const pid = await readPidFile(pidFile)
  if (pid === 0) {
    return false
  }
  return isPidRunning(pid)
}

export async function stopPid(pid: number, sigKillTimeout = 3000): Promise<boolean> {
  try {
    process.kill(pid, 'SIGTERM')
    let deadline = Date.now() + sigKillTimeout
    while (deadline > Date.now()) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (!(await isPidRunning(pid))) {
        return true
      }
    }
    // Send SIGKILL because we overstayed the deadline
    process.kill(pid, 'SIGKILL')
    deadline = Date.now() + 1000
    while (await isPidRunning(pid)) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (!(await isPidRunning(pid))) {
        return true
      }
    }
  } catch (e) {
    if (isNoProcessForPidError(e)) {
      return false
    }
    throw e
  }
  throw new Error(`Pid ${pid} failed to exit`)
}

export async function writePidFile(pidFile: string, acquireTries = 10): Promise<void> {
  for (let i = 0; i < acquireTries; i++) {
    try {
      await fsWriteFileAsync(pidFile, process.pid, { flag: 'wx' })
      return
    } catch (e) {
      const pid = await readPidFile(pidFile)
      if (pid && (await isPidRunning(pid))) {
        await new Promise(resolve => setTimeout(resolve, 100))
      } else {
        await fsUnlinkAsync(pidFile).catch(() => {
          /* Ignore */
        })
      }
    }
  }
}
