import { ChildProcess, SendHandle, Serializable, spawn } from 'child_process'

import { waitFor } from '../promise'

export type ExitInformation = { code: number | null; signal: NodeJS.Signals | null }

export class TimeoutError extends Error {}
export class ExitBeforeOutputMatchError extends Error {}
export class StopBecauseOfOutputError extends Error {}
export class StandardStreamsStillOpenError extends Error {}
export class ProcessNotRunningError extends Error {}

export class RunProcess {
  public cmd: ChildProcess
  public readonly pid: number = 0
  public stdin: ChildProcess['stdin'] = null
  public stdout: ChildProcess['stdout'] = null
  public stderr: ChildProcess['stderr'] = null
  public running: boolean
  public stopped = false
  public stopReason: Error | null = null
  public detached: boolean

  private startPromise: Promise<void>
  private stopPromise: Promise<ExitInformation>
  // TODO: Expose all throws to the error listener
  private errorListeners: Array<(err: Error) => void> = []
  private exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = []

  public constructor(command: string, args: string[] = [], options?: Parameters<typeof spawn>[2]) {
    // Jest does not give access to global process.env so make sure we use the copy we have in the test
    options = { env: process.env, ...options }
    this.cmd = spawn(command, args, options)
    this.detached = options.detached ? options.detached : false

    let exitPromise: Promise<ExitInformation>
    if (this.cmd.pid) {
      this.running = true
      this.startPromise = Promise.resolve()
      this.pid = this.cmd.pid

      // Don't allow attach to stdin if the process was not created as it seems to hang NodeJS
      this.stdin = this.cmd.stdin
      this.stdout = this.cmd.stdout
      this.stderr = this.cmd.stderr

      if (this.detached) {
        this.cmd.unref()
        this.running = false
        exitPromise = Promise.resolve({ code: 0, signal: null })
      } else {
        exitPromise = new Promise(resolve => {
          this.cmd.on('exit', (code, signal) => {
            this.running = false
            resolve({ code, signal })
          })
        })
      }
    } else {
      // Capture the error if fork/exec failed and resolve other promises, fx. if the file does not exists or access errors
      this.running = false
      this.startPromise = new Promise<void>((_, reject) => {
        this.cmd.on('error', e => {
          reject(e)
        })
      })
      exitPromise = Promise.resolve({ code: null, signal: null })
    }

    const stdoutPromise: Promise<void> = this.stdout
      ? new Promise<void>(resolve => this.stdout?.on('end', resolve))
      : Promise.resolve()
    const stderrPromise: Promise<void> = this.stderr
      ? new Promise<void>(resolve => this.stderr?.on('end', resolve))
      : Promise.resolve()

    this.stopPromise = Promise.all([this.startPromise, exitPromise, stdoutPromise, stderrPromise]).then(result => {
      this.stopped = true
      for (const listener of this.exitListeners) {
        listener(result[1].code, result[1].signal)
      }
      return result[1]
    })
    this.stopPromise.catch(() => {
      this.stopped = true
      // Make sure we call the exit listeners
      for (const listener of this.exitListeners) {
        listener(null, null)
      }
    })
  }

  public async stop(sigKillTimeout = 3000, error?: Error): Promise<ExitInformation> {
    this.stopReason = error || null
    if (this.running) {
      this.cmd.kill('SIGTERM')
      if (sigKillTimeout) {
        if (await waitFor(this.stopPromise, sigKillTimeout)) {
          return await this.stopPromise
        }
        this.cmd.kill('SIGKILL')
      }
    } else if (!this.stopped) {
      throw new StandardStreamsStillOpenError('Process exited but standard steams are still open')
    }

    return await this.stopPromise
  }

  public stopOnOutput(
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

  public async waitForStarted(): Promise<void> {
    return await this.startPromise
  }

  public async waitForExit(timeout = 0): Promise<ExitInformation> {
    if (timeout) {
      if (await waitFor(this.stopPromise, timeout)) {
        return await this.stopPromise
      }
      throw new TimeoutError(`Timed out waiting for exit`)
    }
    return await this.stopPromise
  }

  public async waitForOutput(
    regex: RegExp,
    timeout = 0,
    outputs: Array<'stdout' | 'stderr'> = ['stdout', 'stderr']
  ): Promise<RegExpMatchArray> {
    const listeners: Array<['stdout' | 'stderr', (chunk: Buffer) => void]> = []
    let timeoutHandle: NodeJS.Timeout | null = null

    try {
      return await new Promise((resolve, reject) => {
        if (timeout) {
          timeoutHandle = setTimeout(() => reject(new TimeoutError()), timeout)
        }

        // Setup match listener for both stdout and stderr
        let data = ''
        for (const output of outputs) {
          const matchListener = (chunk: Buffer): void => {
            data += chunk.toString('utf8')
            const match = data.match(regex)
            if (match) {
              resolve(match)
            }
          }
          listeners.push([output, matchListener])
          this[output]?.on('data', matchListener)
        }
        // Throw if the process exist before finding the output
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.stopPromise.then(() => {
          reject(this.stopReason ? this.stopReason : new ExitBeforeOutputMatchError(data))
        })
      })
    } finally {
      // Clear the timeout if we find input or not
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
      // Make sure we stop listening when match is found
      for (const [output, listener] of listeners) {
        this[output]?.removeListener('data', listener)
      }
    }
  }

  public removeListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    switch (event) {
      case 'exit': {
        this.exitListeners = this.exitListeners.filter(l => listener != l)
        break
      }
      case 'error': {
        this.errorListeners = this.errorListeners.filter(l => listener != l)
        this.cmd.removeListener(event, listener)
        break
      }
      default: {
        this.cmd.removeListener(event, listener)
      }
    }
    return this
  }

  public removeAllListeners(event?: string | symbol | undefined): this {
    switch (event) {
      case 'exit': {
        this.exitListeners = []
        break
      }
      case 'error': {
        this.errorListeners = []
        this.cmd.removeAllListeners(event)
        break
      }
      default: {
        this.cmd.removeAllListeners(event)
      }
    }
    return this
  }

  public listeners(event: string | symbol): Function[] {
    return this.cmd.listeners(event)
  }

  public on(event: 'close', listener: (code: number, signal: NodeJS.Signals) => void): this
  public on(event: 'disconnect', listener: () => void): this
  public on(event: 'error', listener: (err: Error) => void): this
  public on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  public on(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(event: string, listener: (...args: any[]) => void): this {
    switch (event) {
      case 'exit': {
        this.exitListeners.push(listener)
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

  public kill(signal?: NodeJS.Signals): boolean {
    if (!this.running) {
      throw new ProcessNotRunningError(`Process not running while trying to run .kill()`)
    }
    return this.cmd.kill(signal)
  }
}
