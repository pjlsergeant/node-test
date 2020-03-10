import fs from 'fs'
import util from 'util'

const fsExistsAsync = util.promisify(fs.exists)
const fsReadFileAsync = util.promisify(fs.readFile)

export async function readPidFile(pidFile: string): Promise<number> {
  if (!(await fsExistsAsync(pidFile))) {
    return 0
  }
  const pidFileBuffer = await fsReadFileAsync(pidFile)
  const pidStr = pidFileBuffer.toString('uf8').replace(/\s+$/s, '')
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
