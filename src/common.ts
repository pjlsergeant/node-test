import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const writeFileAsync = promisify(fs.writeFile)
const chmodAsync = promisify(fs.chmod)

// https://github.com/microsoft/TypeScript/issues/1897
export type Json = null | boolean | number | string | Json[] | { [prop: string]: Json }

export function createTempDirectory(): string {
  const tmpDir = os.tmpdir() + path.sep + crypto.randomBytes(8).toString('hex')
  fs.mkdirSync(tmpDir)
  return tmpDir
}

export function prependProcessPath(newPath: string): string {
  return newPath + path.delimiter + process.env.PATH
}

export async function writeCommand(path: string, script: string | Function, interpreter = '/bin/sh'): Promise<void> {
  if (typeof script === 'function') {
    script = `const main = ${script.toString()}\nmain()`
  }
  const fullScript = `#!${interpreter}\n\n${script}\n`
  await writeFileAsync(path, fullScript)
  await chmodAsync(path, '755')
}
