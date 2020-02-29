import { ChildProcess, SendHandle, Serializable, spawn, SpawnOptionsWithoutStdio } from 'child_process'

async function waitFor<T>(promise: Promise<T>, timeout: number): Promise<boolean> {
  let timedOut = false
  let timeoutHandle!: NodeJS.Timeout
  const timeoutPromise = new Promise<void>(resolve => {
    timeoutHandle = setTimeout(() => {
      timedOut = true
      resolve()
    }, timeout)
  })

  try {
    await Promise.race([timeoutPromise, promise])
  } finally {
    clearTimeout(timeoutHandle)
  }
  return !timedOut
}

type ExitInformation = { code: number | null; signal: NodeJS.Signals | null }

export class TimeoutError extends Error {}

export class RunProcess {
  public cmd: ChildProcess
  public readonly pid: number
  public stdin: ChildProcess['stdin']
  public stdout: ChildProcess['stdout']
  public stderr: ChildProcess['stderr']
  public running: boolean

  private exitPromise: Promise<ExitInformation>

  constructor(command: string, args?: string[], options?: SpawnOptionsWithoutStdio) {
    // Jest does not give access to global process.env so make sure we use the copy we have in the test
    options = { env: process.env, ...options }
    this.cmd = spawn(command, args || [], options)
    this.running = true
    this.stdin = this.cmd.stdin
    this.stdout = this.cmd.stdout
    this.stderr = this.cmd.stderr
    this.pid = this.cmd.pid

    const exitPromise = new Promise<ExitInformation>(resolve => {
      this.cmd.on('exit', (code, signal) => {
        this.running = false
        resolve({ code, signal })
      })
    })
    const stdoutPromise = new Promise<void>(resolve => {
      this.cmd.stdout?.on('end', () => {
        resolve()
      })
    })
    const stderrPromise = new Promise<void>(resolve => {
      this.cmd.stderr?.on('end', () => {
        resolve()
      })
    })

    this.exitPromise = Promise.all([exitPromise, stdoutPromise, stderrPromise]).then(result => result[0])
  }

  async stop(sigKillTimeout = 3000): Promise<ExitInformation> {
    if (this.running) {
      this.cmd.kill('SIGTERM')
    }
    if (await waitFor(this.exitPromise, sigKillTimeout)) {
      return await this.exitPromise
    }
    this.cmd.kill('SIGKILL')
    return await this.exitPromise
  }

  async waitForOutput(
    regex: RegExp,
    timeout = 0,
    outputs: Array<'stdout' | 'stderr'> = ['stdout', 'stderr']
  ): Promise<void> {
    return new Promise(resolve => {
      let timeoutHandle: NodeJS.Timeout | null = null
      if (timeout) {
        timeoutHandle = setTimeout((_, reject) => reject(new TimeoutError()), timeout)
      }
      if (outputs.includes('stdout')) {
        let data = ''
        this.stdout?.on('data', chunk => {
          data += chunk.toString('utf8')
          if (data.match(regex)) {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle)
            }
            resolve()
          }
        })
      }
      if (outputs.includes('stderr')) {
        let data = ''
        this.stderr?.on('data', chunk => {
          data += chunk.toString('utf8')
          if (data.match(regex)) {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle)
            }
            resolve()
          }
        })
      }
    })
  }

  on(event: 'close', listener: (code: number, signal: NodeJS.Signals) => void): this
  on(event: 'disconnect', listener: () => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  on(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this
  on(event: string, listener: (...args: any[]) => void): this {
    if (event === 'exit') {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.exitPromise.then(res => {
        listener(res.code, res.signal)
      })
    }

    this.cmd.on(event, listener)
    return this
  }

  kill(signal?: NodeJS.Signals): void {
    this.cmd.kill(signal)
  }
}
