import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sinon from 'sinon'
import { promisify } from 'util'

const mkdirAsync = promisify(fs.mkdir)

// https://github.com/microsoft/TypeScript/issues/1897
export type Json = null | boolean | number | string | Json[] | { [prop: string]: Json }

// Usage: let stub: TypedSinonStub<typeof fs.readFile>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TypedSinonStub<A extends (...args: any) => any> = sinon.SinonStub<Parameters<A>, ReturnType<A>>

export async function createTempDirectory(): Promise<string> {
  const tmpDir = os.tmpdir() + path.sep + crypto.randomBytes(8).toString('hex')
  await mkdirAsync(tmpDir)
  return tmpDir
}
