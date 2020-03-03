import { CommandEmulation } from '../command-emulation'
import { RunProcess } from './run-process'

describe('MySQLServer', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  it('Start process and wait for exit', async () => {
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

  it('Start process and kill it', async () => {
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

  it('Start process that ignores SIGTERM and kill it', async () => {
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
    //cmd.stdout?.on('data', chunk => {
    //  process.stdout.write(chunk)
    //})

    // Wait for application to start
    await cmd.waitForOutput(/Started.../)

    const res = await cmd.stop(10)
    expect(res).toEqual({ code: null, signal: 'SIGKILL' })
  })
})
