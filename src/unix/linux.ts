import childProcess from 'child_process'
import fs from 'fs'
import util from 'util'

const execAsync = util.promisify(childProcess.exec)

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
