import constants from 'constants'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import util from 'util'

const fsReaddirAsync = util.promisify(fs.readdir)
const fsStatAsync = util.promisify(fs.stat)
const fsOpenAsync = util.promisify(fs.open)
const fsCloseAsync = util.promisify(fs.close)
const fsMkdirAsync = util.promisify(fs.mkdir)

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

export async function createTempDirectory(): Promise<string> {
  const tmpDir = os.tmpdir() + path.sep + crypto.randomBytes(8).toString('hex')
  await fsMkdirAsync(tmpDir)
  return tmpDir
}
