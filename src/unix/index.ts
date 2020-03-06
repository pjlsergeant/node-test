import childProcess from 'child_process'
import constants from 'constants'
import fs from 'fs'
import path from 'path'
import util from 'util'

const fsReaddirAsync = util.promisify(fs.readdir)
const fsStatAsync = util.promisify(fs.stat)
const fsOpenAsync = util.promisify(fs.open)
const fsCloseAsync = util.promisify(fs.close)
const execAsync = util.promisify(childProcess.exec)

/**
 * Touch all files recursively from a given path
 * @param rootPath
 */
export async function touchFiles(rootPath: string): Promise<void> {
  const dirs: string[] = [rootPath]
  while (dirs.length > 0) {
    const dir = dirs.shift() as string
    for (const file of await fsReaddirAsync(dir)) {
      const fullPath = path.resolve(dir, file)
      const stat = await fsStatAsync(fullPath)
      if (stat.isDirectory()) {
        dirs.push(fullPath)
      } else if (stat.isFile()) {
        await fsCloseAsync(await fsOpenAsync(fullPath, constants.O_RDWR))
      }
    }
  }
}

export async function isDockerOverlay2(): Promise<boolean> {
  if (!fs.existsSync(`/proc/1/cgroup`)) {
    return false
  }
  const cGroups = fs.readFileSync(`/proc/1/cgroup`).toString()
  if (cGroups.match(/^\d+:[^:]+:\/docker/)) {
    const mounts = await execAsync(`mount`)
      .toString()
      .split('\n')
    if (mounts.some(mount => mount.match(/overlay.*overlay2/) !== null)) {
      return true
    }
  }
  return false
}
