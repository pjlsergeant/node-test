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

export type ExitInformation = { code: number | null; signal: NodeJS.Signals | null }

export class TimeoutError extends Error {}
export class ExitBeforeOutputMatchError extends Error {}
export class StopBecauseOfOutputError extends Error {}

export class RunProcess {
  public cmd: ChildProcess
  public readonly pid: number
  public stdin: ChildProcess['stdin']
  public stdout: ChildProcess['stdout']
  public stderr: ChildProcess['stderr']
  public running: boolean
  public stopReason: Error | null = null

  private stopPromise: Promise<ExitInformation>
  private errorListeners: Array<(err: Error) => void> = []

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

    this.stopPromise = Promise.all([exitPromise, stdoutPromise, stderrPromise]).then(result => result[0])
  }

  async stop(sigKillTimeout = 3000, error?: Error): Promise<ExitInformation> {
    this.stopReason = error || null
    if (this.running) {
      this.cmd.kill('SIGTERM')
    }
    if (await waitFor(this.stopPromise, sigKillTimeout)) {
      return await this.stopPromise
    }
    this.cmd.kill('SIGKILL')
    return await this.stopPromise
  }

  stopOnOutput(
    regex: RegExp,
    errorMessage?: string,
    timeout = 0,
    outputs: Array<'stdout' | 'stderr'> = ['stdout', 'stderr']
  ): void {
    this.waitForOutput(regex, timeout, outputs)
      .then(() => {
        return this.stop(timeout, new StopBecauseOfOutputError(errorMessage))
      })
      .catch(() => {
        // Ignore other errors as we only need to kill the process if we see the output
      })
  }

  async waitForExit(timeout = 0): Promise<ExitInformation> {
    if (timeout) {
      if (await waitFor(this.stopPromise, timeout)) {
        return await this.stopPromise
      }
      throw new TimeoutError()
    }
    return await this.stopPromise
  }

  waitForOutput(
    regex: RegExp,
    timeout = 0,
    outputs: Array<'stdout' | 'stderr'> = ['stdout', 'stderr']
  ): Promise<RegExpMatchArray> {
    return new Promise((resolve, reject) => {
      // Throw if the process exist before finding the output
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.stopPromise.then(() => {
        reject(this.stopReason ? this.stopReason : new ExitBeforeOutputMatchError())
      })

      let timeoutHandle: NodeJS.Timeout | null = null
      if (timeout) {
        timeoutHandle = setTimeout(() => reject(new TimeoutError()), timeout)
      }

      for (const output of outputs) {
        let data = ''
        this[output]?.on('data', (chunk: Buffer) => {
          data += chunk.toString('utf8')
          const match = data.match(regex)
          if (match) {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle)
            }
            resolve(match)
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
    switch (event) {
      case 'exit': {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.stopPromise.then(res => {
          listener(res.code, res.signal)
        })
        break
      }
      case 'error': {
        this.errorListeners.push(listener)
        this.cmd.on(event, listener)
        break
      }
      default: {
        this.cmd.on(event, listener)
      }
    }
    return this
  }

  kill(signal?: NodeJS.Signals): void {
    this.cmd.kill(signal)
  }
}
