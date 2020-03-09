import { exec, ExecOptions } from 'child_process'

import { CommandEmulation } from './command-emulation'

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
  const commandEmulation = new CommandEmulation()

  beforeAll(async () => {
    await commandEmulation.registerCommand('fake-global-command', 'echo hello global')
  })

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  it('should run faked sh command with local path', async () => {
    await commandEmulation.registerCommand('fake-sh-command', 'echo hello')
    const result = await shell('fake-sh-command', { env: { ...process.env, PATH: await commandEmulation.getPath() } })
    expect(result).toMatchObject({
      code: 0,
      stdout: 'hello\n',
      stderr: ''
    })
  })

  it('should run faked bash command', async () => {
    await commandEmulation.registerCommand('fake-bash-command', 'echo -n hello', '/bin/bash')
    const result = await shell('fake-bash-command')
    expect(result).toMatchObject({
      code: 0,
      stdout: 'hello',
      stderr: ''
    })
  })

  it('should run faked node command', async () => {
    await commandEmulation.registerCommand('fake-node-command', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const os = require('os')
      console.log('Hello ' + os.arch())
    })

    const result = await shell('fake-node-command')
    expect(result).toMatchObject({
      code: 0,
      stdout: expect.stringMatching(/^Hello .+/),
      stderr: ''
    })
  })

  it('should run faked node command with inject data', async () => {
    const outsideData = 'stuff'
    await commandEmulation.registerCommand(
      'fake-node-command',
      data => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        console.log('Hello ' + data)
      },
      null,
      outsideData
    )

    const result = await shell('fake-node-command')
    expect(result).toMatchObject({
      code: 0,
      stdout: expect.stringMatching(/^Hello stuff/),
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
