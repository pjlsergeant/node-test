import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'

import { CommandEmulation, createTempDirectory, RunProcess } from '../src/unix'

const execAsync = util.promisify(childProcess.exec)
const fsSymlink = util.promisify(fs.symlink)
const fsUnlink = util.promisify(fs.unlink)
const fsReadFile = util.promisify(fs.readFile)

describe('run-wrapper', () => {
  const commandEmulation = new CommandEmulation()

  beforeAll(async () => {
    // Make sure wrapper has been compiled
    await execAsync('npm run build:js')
    await commandEmulation.registerPath('build/dist/bin')
    try {
      await fsUnlink('build/dist/bin/run-wrapper').catch(e => {
        // TODO: validate that it's no entry we get
      })
      await fsSymlink(path.resolve('build/dist/bin/run-wrapper.js'), 'build/dist/bin/run-wrapper')
    } catch (e) {
      // Ignore
    }
  }, 10000)

  afterAll(async () => {
    await fsUnlink('build/dist/bin/run-wrapper').catch(e => {
      // TODO: validate that it's no entry we get
    })
  })

  const processCleanup: Array<RunProcess> = []
  afterEach(async () => {
    // Make sure all process are stopped
    for (const process of processCleanup) {
      await process.stop()
    }
  })

  it(`should start a process that stops when we close it's stdin`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      console.log('Hello world')
    })

    const cmd = new RunProcess('run-wrapper', ['--stop-on-stdin-close', '--', 'my-hello'])
    processCleanup.push(cmd)
    const data: Buffer[] = []
    cmd.stdout?.on('data', chunk => {
      data.push(chunk)
    })
    cmd.stderr?.on('data', chunk => {
      data.push(chunk)
    })

    await expect(cmd.waitForOutput(/Hello world/)).resolves.toMatchObject({ 0: 'Hello world' })
    cmd.stdin?.end()
    await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
    expect(Buffer.concat(data).toString('utf8')).toBe('Started my-hello\nHello world\nStopping because stdin closed\n')
  })

  it(`should start a process that stops when send SIGTERM to it`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      console.log('hello world')
    })

    const cmd = new RunProcess('run-wrapper', ['--', 'my-hello'])
    processCleanup.push(cmd)
    const data: Buffer[] = []
    cmd.stdout?.on('data', chunk => {
      data.push(chunk)
    })
    cmd.stderr?.on('data', chunk => {
      data.push(chunk)
    })

    await expect(cmd.waitForOutput(/hello world/)).resolves.toMatchObject({ 0: 'hello world' })
    await expect(cmd.stop()).resolves.toEqual({ code: 0, signal: null })
    expect(Buffer.concat(data).toString('utf8')).toEqual('Started my-hello\nhello world\nStopping because SIGTERM\n')
  })

  it(`should start a process that logs to file`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      console.log('hello world')
      console.error('stderr')
    })

    const tmpdir = await createTempDirectory()
    const cmd = new RunProcess('run-wrapper', [
      `--stdout-file=${tmpdir}/stdout.log`,
      `--stderr-file=${tmpdir}/stderr.log`,
      '--',
      'my-hello'
    ])
    processCleanup.push(cmd)

    await expect(cmd.waitForOutput(/hello world/)).resolves.toMatchObject({ 0: 'hello world' })
    await expect(cmd.stop()).resolves.toEqual({ code: 0, signal: null })

    const stdoutData = (await fsReadFile(`${tmpdir}/stdout.log`)).toString('utf8')
    expect(stdoutData).toEqual('hello world\n')
    const stderrData = (await fsReadFile(`${tmpdir}/stderr.log`)).toString('utf8')
    expect(stderrData).toEqual('stderr\n')
  })
})
