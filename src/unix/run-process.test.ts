import { CommandEmulation } from './command-emulation'
import { isPidRunning } from './process'
import {
  ProcessNotRunningError,
  RunProcess,
  StandardStreamsStillOpenError,
  StopBecauseOfOutputError
} from './run-process'

describe('run-process', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  const processCleanup: Array<RunProcess> = []
  afterEach(async () => {
    // Make sure all process are stopped
    while (processCleanup.length > 0) {
      const process = processCleanup.shift()
      await process?.stop()
    }
  })

  it('should start a process and wait for exit', async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      console.log('hello')
    })
    const cmd = new RunProcess('my-hello')
    processCleanup.push(cmd)
    const data: Buffer[] = []
    cmd.stdout?.on('data', chunk => {
      data.push(chunk)
    })
    await new Promise(resolve => cmd.on('exit', resolve))
    expect(Buffer.concat(data).toString('utf8')).toEqual('hello\n')
  })

  it('should start a process and kill it', async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        //  Keep node running
      }, 1000000)
      console.log('Started...')
    })
    const cmd = new RunProcess('my-hello')
    // Wait for application to start
    await cmd.waitForOutput(/Started.../)

    // Make sure we don't leak listeners
    expect(cmd.stdout?.listenerCount('data')).toEqual(0)
    expect(cmd.stderr?.listenerCount('data')).toEqual(0)

    const res = await cmd.stop()
    expect(res).toEqual({ code: null, signal: 'SIGTERM' })
  })

  it('should start a process that ignores SIGTERM and kill it', async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      process.on('SIGTERM', () => {
        // Ignore SIGTERM
      })
      setTimeout(() => {
        console.log('timeout')
        // Keep node running
      }, 1000000)
      console.log('Started...')
    })

    const cmd = new RunProcess('my-hello')
    processCleanup.push(cmd)

    // Wait for application to start
    await cmd.waitForOutput(/Started.../)

    const res = await cmd.stop(10)
    expect(res).toEqual({ code: null, signal: 'SIGKILL' })
  })

  it('should start a process and stop it on output', async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        console.log('you suck')
        // Keep node running
      }, 10)
    })

    const cmd = new RunProcess('my-hello')
    processCleanup.push(cmd)
    cmd.stopOnOutput(/you suck/)

    // Wait for application to start
    const waiting = cmd.waitForOutput(/Started.../)
    await expect(waiting).rejects.toThrow(StopBecauseOfOutputError)
  })

  it(`should start a process that stops when we close it's stdin`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      // Seems we need to listen to the data event before getting the end event
      process.stdin.on('data', chunk => {
        process.stdout.write(chunk)
      })
      process.stdin.on('end', () => {
        console.log('Stopping...')
        process.exit(0)
      })
      console.log('Started my-hello...')
    })

    const cmd = new RunProcess('my-hello')
    processCleanup.push(cmd)
    const data: Buffer[] = []
    cmd.stdout?.on('data', chunk => {
      data.push(chunk)
    })
    cmd.stderr?.on('data', chunk => {
      data.push(chunk)
    })
    const matchPromise = cmd.waitForOutput(/Started (.+?)\.\.\./)
    await expect(matchPromise).resolves.toMatchObject({ 0: 'Started my-hello...', 1: 'my-hello' })
    cmd.stdin?.end()
    const exitCodePromise = cmd.waitForExit()
    await expect(exitCodePromise).resolves.toEqual({ code: 0, signal: null })
    expect(Buffer.concat(data).toString('utf8')).toEqual('Started my-hello...\nStopping...\n')
  })

  it(`should completely detach process`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 20000)
    })

    const cmd = new RunProcess('my-hello', [], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
    processCleanup.push(cmd)
    const exitCodePromise = cmd.waitForExit()
    await expect(exitCodePromise).resolves.toEqual({ code: 0, signal: null })
    await expect(isPidRunning(cmd.pid)).resolves.toEqual(true)
  })

  it(`should detach and fork a new process`, async () => {
    await commandEmulation.registerCommand('sleeping', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const childProcess = require('child_process')
      const child = childProcess.spawn('sh', ['-c', 'sleep 0.1; echo hello'], {
        detached: true,
        stdio: ['inherit', 'inherit', 'inherit']
      })
      child.unref()
      process.exit(0)
    })
    const cmd = new RunProcess('sleeping', [])
    await cmd.waitForOutput(/hello/)
    const stopPromise = cmd.stop()
    await expect(stopPromise).rejects.toThrow(StandardStreamsStillOpenError)
    expect(() => {
      cmd.kill()
    }).toThrow(ProcessNotRunningError)
  })

  it('should not hang .on("exit") if a command does not exist', async () => {
    const cmd = new RunProcess('my-command-that-does-not-exist')
    const exitPromise = new Promise(resolve => cmd.on('exit', (code, signal) => resolve({ code, signal })))
    await expect(exitPromise).resolves.toMatchObject({
      code: null,
      signal: null
    })
    await expect(cmd.waitForExit()).rejects.toThrow('spawn my-command-that-does-not-exist ENOENT')
  })

  it('should not hang on waitForExit(), if the timeout is longer than the process runtime', async () => {
    await commandEmulation.registerCommand('hangingTooLongTimeout', async () => {
      console.log(`started`)
      setTimeout(() => {
        console.log(`hello`)
      }, 100)
    })
    processCleanup.push()

    const cmd = new RunProcess(`hangingTooLongTimeout`)
    await expect(cmd.waitForOutput(new RegExp(`never comes up`), 2000)).rejects.toThrow(`started\nhello\n`)
  })
})
