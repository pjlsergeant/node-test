import { CommandEmulation } from './command-emulation'
import { RunProcess, StopBecauseOfOutputError } from './run-process'

describe('run-process', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  it('should start a process and wait for exit', async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      console.log('hello')
    })
    const cmd = new RunProcess('my-hello')
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
})
