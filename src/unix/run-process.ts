import { ChildProcess, SendHandle, Serializable, spawn } from 'child_process'

import { waitFor } from '../promise'

export type ExitInformation = { code: number | null; signal: NodeJS.Signals | null }

export class TimeoutError extends Error {}
export class ExitBeforeOutputMatchError extends Error {}
export class StopBecauseOfOutputError extends Error {}

export class RunProcess {
  public cmd: ChildProcess
  public readonly pid: number = 0
  public stdin: ChildProcess['stdin'] = null
  public stdout: ChildProcess['stdout'] = null
  public stderr: ChildProcess['stderr'] = null
  public running: boolean
  public stopReason: Error | null = null

  private startPromise: Promise<void>
  private stopPromise: Promise<ExitInformation>
  private errorListeners: Array<(err: Error) => void> = []

  constructor(command: string, args?: string[], options?: Parameters<typeof spawn>[2]) {
    // Jest does not give access to global process.env so make sure we use the copy we have in the test
    options = { env: process.env, ...options }
    this.cmd = spawn(command, args || [], options)
    this.running = true
    if (this.cmd.pid) {
      // Don't allow attach to stdin if the process was not created as it seems to hang NodeJS
      this.pid = this.cmd.pid
      this.stdin = this.cmd.stdin
      this.stdout = this.cmd.stdout
      this.stderr = this.cmd.stderr
    }

    // Capture the error the fork/exec failed, fx. if the file does not exists or access errors
    this.startPromise = new Promise<void>((resolve, reject) => {
      if (this.pid) {
        resolve()
      } else {
        this.cmd.on('error', e => {
          reject(e)
        })
      }
    })

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

    this.stopPromise = Promise.all([this.startPromise, exitPromise, stdoutPromise, stderrPromise]).then(
      result => result[1]
    )
    this.stopPromise.catch(() => {
      // User might never bind to this promise if they are just starting a process not caring about if it runs on not
    })
  }

  async stop(sigKillTimeout = 3000, error?: Error): Promise<ExitInformation> {
    this.stopReason = error || null
    if (this.running) {
      this.cmd.kill('SIGTERM')
    }
    if (sigKillTimeout) {
      if (await waitFor(this.stopPromise, sigKillTimeout)) {
        return await this.stopPromise
      }
      this.cmd.kill('SIGKILL')
    }
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

  async waitForStarted(): Promise<void> {
    return await this.startPromise
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
      let timeoutHandle: NodeJS.Timeout | null = null
      if (timeout) {
        timeoutHandle = setTimeout(() => reject(new TimeoutError()), timeout)
      }

      let data = ''
      for (const output of outputs) {
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
      // Throw if the process exist before finding the output
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.stopPromise.then(() => {
        reject(this.stopReason ? this.stopReason : new ExitBeforeOutputMatchError(data))
      })
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
