import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'

import { CommandEmulation, createTempDirectory, isPidRunning, readPidFile, RunProcess } from '../src/unix'

const execAsync = util.promisify(childProcess.exec)
const fsSymlink = util.promisify(fs.symlink)
const fsUnlink = util.promisify(fs.unlink)
const fsReadFile = util.promisify(fs.readFile)
const existsAsync = util.promisify(fs.exists)

describe('run-wrapper', () => {
  const commandEmulation = new CommandEmulation()

  beforeAll(async () => {
    // Make sure wrapper has been compiled
    await execAsync('npm run build:js')
    await commandEmulation.registerPath('build/dist/bin')
    try {
      await fsUnlink('build/dist/bin/run-wrapper').catch(() => {
        // TODO: validate that it's no entry we get
      })
      await fsSymlink(path.resolve('build/dist/bin/run-wrapper.js'), 'build/dist/bin/run-wrapper')
    } catch (e) {
      // Ignore
    }
  }, 10000)

  afterAll(async () => {
    await fsUnlink('build/dist/bin/run-wrapper').catch(() => {
      // TODO: validate that it's no entry we get
    })
  })

  const processCleanup: Array<RunProcess> = []
  const pidCleanup: Array<number> = []
  afterEach(async () => {
    // Make sure all process are stopped
    for (const process of processCleanup) {
      await process.stop()
    }
    for (const pid of pidCleanup) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (e) {
        // Ignore
      }
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
    expect(Buffer.concat(data).toString('utf8')).toMatch(
      /Started my-hello with pid \d+\nHello world\nStopping because stdin closed\n/s
    )
  })

  it(`should start a process that stops when send SIGTERM to it`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      console.log('Hello world')
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

    await expect(cmd.waitForOutput(/Hello world/)).resolves.toMatchObject({ 0: 'Hello world' })
    await expect(cmd.stop()).resolves.toEqual({ code: 0, signal: null })
    expect(Buffer.concat(data).toString('utf8')).toMatch(
      /Started my-hello with pid \d+\nHello world\nStopping because SIGTERM\n/s
    )
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

  it(`should saves a PID file`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      console.log('hello world')
      console.error('stderr')
    })

    const tmpdir = await createTempDirectory()
    const cmd = new RunProcess('run-wrapper', [`--pid-file=${tmpdir}/run-wrapper.pid`, 'my-hello'])
    processCleanup.push(cmd)

    await expect(cmd.waitForOutput(/hello world/)).resolves.toMatchObject({ 0: 'hello world' })

    const pid = await readPidFile(`${tmpdir}/run-wrapper.pid`)
    expect(pid).toEqual(cmd.pid)
    await expect(cmd.stop()).resolves.toEqual({ code: 0, signal: null })
  })

  it(`should completely detach process`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 60000)
    })

    const cmd = new RunProcess('run-wrapper', [`--detached`, 'my-hello'])
    processCleanup.push(cmd)
    const match = await cmd.waitForOutput(/with pid (\d+)/)
    await expect(match).toMatchObject({
      0: expect.stringMatching(/with pid/),
      1: expect.stringMatching(/^\d+$/)
    })
    const pid = parseInt(match[1])
    pidCleanup.push(pid)
    await expect(cmd.waitForOutput(/Stopping because (.+)/)).resolves.toMatchObject({
      0: expect.stringMatching(/Stopping because/),
      1: expect.stringMatching(/process existed/)
    })
    await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
    await expect(isPidRunning(pid)).resolves.toEqual(true)
  })

  it(`should detach and log to file`, async () => {
    const tmpdir = await createTempDirectory()
    await commandEmulation.registerCommand(
      'my-hello',
      data => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const fs = require('fs')
        setTimeout(() => {
          // Make sure the process keeps running
        }, 10000)
        console.log('hello world')
        console.error('stderr')
        fs.writeFileSync(`${data}/my-hello.pid`, process.pid)
      },
      null,
      tmpdir
    )

    const cmd = new RunProcess('run-wrapper', [
      `--stdout-file=${tmpdir}/stdout.log`,
      `--stderr-file=${tmpdir}/stderr.log`,
      `--detached`,
      'my-hello'
    ])
    processCleanup.push(cmd)

    const match = await cmd.waitForOutput(/with pid (\d+)/)
    await expect(match).toMatchObject({
      0: expect.stringMatching(/with pid/),
      1: expect.stringMatching(/^\d+$/)
    })
    const pid = parseInt(match[1])
    pidCleanup.push(pid)

    await expect(cmd.waitForOutput(/Stopping because (.+)/)).resolves.toMatchObject({
      0: expect.stringMatching(/Stopping because/),
      1: expect.stringMatching(/process existed/)
    })
    await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
    await expect(isPidRunning(pid)).resolves.toEqual(true)

    // Wait for process to start
    while (!(await existsAsync(`${tmpdir}/my-hello.pid`))) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    const stdoutData = (await fsReadFile(`${tmpdir}/stdout.log`)).toString('utf8')
    expect(stdoutData).toEqual('hello world\n')
    const stderrData = (await fsReadFile(`${tmpdir}/stderr.log`)).toString('utf8')
    expect(stderrData).toEqual('stderr\n')
  })
})
