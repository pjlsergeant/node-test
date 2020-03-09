import fs from 'fs'
import util from 'util'

const fsExistsAsync = util.promisify(fs.exists)
const fsReadFileAsync = util.promisify(fs.readFile)

export async function isPidFileRunning(pidFile: string): Promise<boolean | void> {
  if (!(await fsExistsAsync(pidFile))) {
    return false
  }
  const pidFileBuffer = await fsReadFileAsync(pidFile)
  const pidStr = pidFileBuffer.toString('uf8').replace(/\s+$/s, '')
  if (!pidStr.match(/^\d+$/)) {
    return false
  }
  const pid = parseInt(pidStr, 10)
  try {
    return process.kill(pid, 0)
  } catch (e) {
    return e.code === 'EPERM'
  }
}
