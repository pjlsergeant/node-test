import * as fs from 'fs'

import { CommandEmulation } from './command-emulation'
import { isPidRunning } from './process'
import {
  createNamedPipe,
  deleteNamedPipe,
  ProcessNotRunningError,
  RunProcess,
  StandardStreamsStillOpenError,
  StopBecauseOfOutputError
} from './run-process'

describe('run-process', () => {
  describe('spawn processes', () => {
    const commandEmulation = new CommandEmulation()

    afterAll(async () => {
      await commandEmulation.cleanup()
    })

    const processCleanup: Array<RunProcess> = []
    afterEach(async () => {
      // Make sure all process are stopped
      for (const process of processCleanup) {
        await process.stop()
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

    it(`should repeat when we write to stdin`, async () => {
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
      const matchPromise1 = cmd.waitForOutput(/Started (.+?)\.\.\./)
      await expect(matchPromise1).resolves.toMatchObject({ 0: 'Started my-hello...', 1: 'my-hello' })

      cmd.stdin?.write('sutte')
      const matchPromise2 = cmd.waitForOutput(/sutte/)
      await expect(matchPromise2).resolves.toMatchObject({ 0: 'sutte' })

      cmd.stdin?.end()

      const exitCodePromise = cmd.waitForExit()
      await expect(exitCodePromise).resolves.toEqual({ code: 0, signal: null })
      expect(Buffer.concat(data).toString('utf8')).toEqual('Started my-hello...\nsutteStopping...\n')
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
  })

  describe('exec processes', () => {
    it('should run a bash script (which is exec to not create an extra layered sub process)', async done => {
      const endTxtLocation = '/tmp/test-exec.txt'

      //TODO: re-add
      // expect(fs.existsSync(endTxtLocation)).toEqual(false)
      await new RunProcess('./src/bin/test-exec.sh', [], undefined, true).waitForExit()
      expect(fs.existsSync(endTxtLocation)).toEqual(true)
      fs.unlinkSync(endTxtLocation)
      done()
    })
  })

  describe('named pipe', () => {
    it('should show isolated watch process works and exits (make sure some handling works under the hood)', async done => {
      const cmd = new RunProcess('watch', ['echo', 'keepitgoing'], { stdio: 'ignore' })
      await cmd.stop()
      await cmd.waitForExit()
      done()
    }, 5000)

    it('should run a process which uses named pipes (fifo)', async done => {
      const pipeLocation = '/tmp/testpipe1'
      // Run random command which does not exit. (Is not important we are testing the named pipe functionality)
      const cmd = new RunProcess(
        'watch',
        ['echo', 'keepitgoing'],
        // { stdio: 'ignore' } is needed for for the parent process to exit, otherwise it hangs and we get a PIPEWRAP error
        // { stdio: 'ignore', detached: false },
        undefined,
        false,
        pipeLocation
      )

      await createNamedPipe(pipeLocation)
      await cmd.setupNamedPipeServer()

      await cmd.writeToNamedPipe('suttekarl')
      await cmd.waitForNamedPipeOutput(new RegExp('suttekarl'))
      expect(cmd.namedPipe?.outDataStr).toEqual('suttekarl\n')

      await cmd.stop()
      await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
      deleteNamedPipe(pipeLocation)
      done() // it waits for something? (this shouldn't be needed?)
    }, 4000)

    it('should run a process which uses named pipes (fifo), but never find the output', async done => {
      const pipeLocation = '/tmp/testpipe2'
      // Run random command which does not exit. (Is not important we are testing the named pipe functionality)
      const cmd = new RunProcess('watch', ['echo', 'hello'], undefined, false, '/tmp/testpipe2')

      await createNamedPipe(pipeLocation)
      await cmd.setupNamedPipeServer()

      await cmd.writeToNamedPipe('suttekarl1')
      await expect(cmd.waitForNamedPipeOutput(new RegExp('suttekarl2'), 500)).rejects.toThrow(
        'Timeout waiting for named pipe output'
      )

      await cmd.stop()
      await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
      deleteNamedPipe(pipeLocation)
      done()
    }, 10000)
  })
})
