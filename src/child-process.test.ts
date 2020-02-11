import { exec, ExecOptions } from 'child_process'
import fs from 'fs'
import { promisify } from 'util'
const rmdirAsync = promisify(fs.rmdir)

import { createTempDirectory, prependProcessPath, writeCommand } from './common'

interface CommandResult {
  stdout: string
  stderr: string
  code: number
  signal?: NodeJS.Signals
}

function shell(command: string, options: ExecOptions = {}): Promise<CommandResult> {
  // Jest does not give access to global process.env so make sure we use the copy we have in the test
  options = { env: process.env, ...options }
  return new Promise(resolve => {
    exec(command, options, (err, stdout, stderr) => {
      if (err instanceof Error) {
        return resolve({ stdout, stderr, code: err.code || 0, signal: err.signal })
      }
      return resolve({ stdout, stderr, code: 0 })
    })
  })
}

describe('ChildProcess', () => {
  const tmpdir = createTempDirectory()
  const oldPath = process.env.PATH

  beforeAll(async () => {
    await writeCommand(`${tmpdir}/fake-global-command`, 'echo hello global')
  })

  afterAll(async () => {
    await rmdirAsync(tmpdir, { recursive: true })
  })

  beforeEach(() => {
    process.env.PATH = prependProcessPath(tmpdir)
  })

  afterEach(() => {
    process.env.PATH = oldPath
  })

  it('should run faked sh command', async () => {
    await writeCommand(`${tmpdir}/fake-sh-command`, 'echo hello')
    const result = await shell('fake-sh-command', { env: { ...process.env, PATH: prependProcessPath(tmpdir) } })
    expect(result).toMatchObject({
      code: 0,
      stdout: 'hello\n',
      stderr: ''
    })
  })

  it('should run faked bash command', async () => {
    await writeCommand(`${tmpdir}/fake-bash-command`, 'echo -n hello', '/bin/bash')
    const result = await shell('fake-bash-command', { env: { ...process.env, PATH: prependProcessPath(tmpdir) } })
    expect(result).toMatchObject({
      code: 0,
      stdout: 'hello',
      stderr: ''
    })
  })

  it('should run faked node command', async () => {
    await writeCommand(
      `${tmpdir}/fake-node-command`,
      function() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const os = require('os')
        console.log('Hello ' + os.arch())
      },
      '/usr/bin/env node'
    )

    const result = await shell('fake-node-command', { env: { ...process.env, PATH: prependProcessPath(tmpdir) } })
    expect(result).toMatchObject({
      code: 0,
      stdout: expect.stringMatching(/^Hello .+/),
      stderr: ''
    })
  })

  it('should run faked command from global PATH', async () => {
    const result = await shell('fake-global-command')
    expect(result).toMatchObject({
      code: 0,
      stdout: 'hello global\n',
      stderr: ''
    })
  })
})
