import { ChildProcess, exec, SendHandle, Serializable, spawn } from 'child_process'
import * as fs from 'fs'
import * as net from 'net'

import { waitFor } from '../promise'

export type ExitInformation = { code: number | null; signal: NodeJS.Signals | null }

export class TimeoutError extends Error {}
export class ExitBeforeOutputMatchError extends Error {}
export class StopBecauseOfOutputError extends Error {}
export class StandardStreamsStillOpenError extends Error {}
export class ProcessNotRunningError extends Error {}
export class NoNamedPipeError extends Error {}

export interface NamedPipe {
  location: string
  listener: net.Socket | undefined
  outData: Array<Buffer>
  outDataStr: string
}

export function isNamedPipe(x: NamedPipe | undefined): x is NamedPipe {
  return x !== undefined
}

export class RunProcess {
  public cmd: ChildProcess
  public isExec: boolean
  public namedPipe: NamedPipe | undefined = undefined
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

  public constructor(
    command: string,
    args?: string[],
    options?: Parameters<typeof spawn>[2],
    shouldExec = false,
    namedPipeLocation?: string
  ) {
    // Jest does not give access to global process.env so make sure we use the copy we have in the test
    options = { env: process.env, ...options }

    // Exec or spawn command
    shouldExec ? (this.cmd = exec(command)) : (this.cmd = spawn(command, args || [], options))
    this.isExec = shouldExec
    this.detached = options.detached ? options.detached : false

    if (namedPipeLocation !== undefined) {
      this.namedPipe = {
        location: namedPipeLocation,
        server: undefined,
        outData: [] as Buffer[],
        outDataStr: '',
        isSelfCreatedPipe: false,
        listener: undefined
      } as NamedPipe
    }

    // Don't allow attach to stdin if the process was not created as it seems to hang NodeJS
    if (this.cmd.pid) {
      this.pid = this.cmd.pid
      this.stdin = this.cmd.stdin
      this.stdout = this.cmd.stdout
      this.stderr = this.cmd.stderr
    }

    // Capture the error the fork/exec failed, fx. if the file does not exists or access errors
    if (this.pid) {
      this.running = true
      this.startPromise = Promise.resolve()
    } else {
      this.running = false
      this.startPromise = new Promise<void>((_, reject) => this.cmd.on('error', reject))
    }

    let exitPromise: Promise<ExitInformation>
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

    const stdoutPromise: Promise<void> = this.cmd.stdout
      ? new Promise<void>(resolve => this.cmd.stdout?.on('end', resolve))
      : Promise.resolve()
    const stderrPromise: Promise<void> = this.cmd.stderr
      ? new Promise<void>(resolve => this.cmd.stderr?.on('end', resolve))
      : Promise.resolve()

    this.stopPromise = Promise.all([this.startPromise, exitPromise, stdoutPromise, stderrPromise]).then(result => {
      this.stopped = true
      return result[1]
    })
    this.stopPromise
      .then(res => {
        for (const listener of this.exitListeners) {
          listener(res.code, res.signal)
        }
      })
      .catch(() => {
        // User might never bind to this promise if they are just starting a process not caring about if it runs on not
      })
  }

  /**
   * We can't do async stuff in the constructor, manually call this
   * https://stackoverflow.com/questions/44982499/read-from-a-named-pipe-fifo-with-node-js/46965930
   */
  public async setupNamedPipeServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isNamedPipe(this.namedPipe)) {
        fs.open(this.namedPipe.location, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK, (err, fd) => {
          if (err) {
            reject(err)
          }
          if (isNamedPipe(this.namedPipe)) {
            this.namedPipe.listener = new net.Socket({ fd })

            this.namedPipe.listener.on('data', chunk => {
              if (this.namedPipe !== undefined) {
                this.namedPipe.outData.push(chunk)
                this.namedPipe.outDataStr += chunk.toString('utf8')
              }
            })
          }

          // Resolve when we have set up the events
          resolve()
        })
      } else {
        throw new NoNamedPipeError('No named pipe set, when setting up the listener')
      }
    })
  }

  public async writeToNamedPipe(input: string): Promise<void> {
    if (this.namedPipe !== undefined) {
      await new RunProcess('echo', [`${input} > ${this.namedPipe.location}`], { shell: true }).waitForExit()
    } else {
      throw new NoNamedPipeError(`No named pipe set, when writing data: ${input}`)
    }
  }

  public async waitForNamedPipeOutput(regex: RegExp, timeout = 0): Promise<RegExpMatchArray> {
    return await new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null
      if (timeout) {
        timeoutHandle = setTimeout(() => reject(new TimeoutError()), timeout)
      }

      // Check for input every 100 ms
      setInterval(() => {
        if (isNamedPipe(this.namedPipe)) {
          const match = this.namedPipe.outDataStr.match(regex)
          if (match) {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle)
            }
            resolve(match)
          }
        } else {
          reject(new NoNamedPipeError(`No named pipe set, when waiting for regex: ${regex}`))
        }
      }, 100)

      // Throw if the process exist before finding the output
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.stopPromise.then(() => {
        reject(
          this.stopReason
            ? this.stopReason
            : new ExitBeforeOutputMatchError(
                `Process exitted before regex: ${regex} was found.\nTotal outDataStr:\n${this.namedPipe?.outDataStr}`
              )
        )
      })
    })
  }

  public async stop(sigKillTimeout = 3000, error?: Error): Promise<ExitInformation> {
    this.stopReason = error || null
    if (this.running) {
      // Close named pipe stuff
      if (isNamedPipe(this.namedPipe)) {
        this.namedPipe.listener?.removeAllListeners()
        this.namedPipe.listener?.end()
      }

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
      throw new TimeoutError()
    }
    return await this.stopPromise
  }

  public async waitForOutput(
    regex: RegExp,
    timeout = 0,
    outputs: Array<'stdout' | 'stderr'> = ['stdout', 'stderr']
  ): Promise<RegExpMatchArray> {
    const listeners: Array<['stdout' | 'stderr', (chunk: Buffer) => void]> = []
    try {
      return await new Promise((resolve, reject) => {
        let timeoutHandle: NodeJS.Timeout | null = null
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
              if (timeoutHandle) {
                clearTimeout(timeoutHandle)
              }
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
      throw new ProcessNotRunningError()
    }
    return this.cmd.kill(signal)
  }
}

// Create named pipe manually, since we will have problems in the constructor/order stuff happens. In real examples the pipe needs to exist before the process is run anyway.
export async function createNamedPipe(pipeLocation: string): Promise<void> {
  await new RunProcess('mkfifo', [pipeLocation]).waitForExit()
}
