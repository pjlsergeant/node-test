import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const unlinkAsync = promisify(fs.unlink)
const rmdirAsync = promisify(fs.rmdir)
const writeFileAsync = promisify(fs.writeFile)
const chmodAsync = promisify(fs.chmod)

import { createTempDirectory } from './common'

export interface CommandEmulationOptions {
  overridePath: boolean
}

export class CommandEmulation {
  public tmpdir!: string
  private oldPath!: string
  private newPath!: string
  private commands: string[] = []
  private initPromise: Promise<void>

  constructor(options?: CommandEmulationOptions) {
    this.initPromise = this.init(options)
    this.initPromise.catch(() => {
      // Do nothing as we will throw at later calls
    })
  }

  static async new(options?: CommandEmulationOptions): Promise<CommandEmulation> {
    const instance = new CommandEmulation(options)
    await instance.initPromise
    return instance
  }

  private async init(options: CommandEmulationOptions = { overridePath: true }): Promise<void> {
    this.tmpdir = await createTempDirectory()
    this.oldPath = process.env.PATH || ''
    this.newPath = this.tmpdir + path.delimiter + this.oldPath

    if (options.overridePath) {
      process.env.PATH = this.newPath
    }
  }

  async setup(options: CommandEmulationOptions): Promise<void> {
    this.initPromise = this.init(options)
  }

  async registerCommand(cmd: string, script: string | Function, interpreter = '/bin/sh'): Promise<void> {
    await this.initPromise // Make sure init has finished

    const path = `${this.tmpdir}/${cmd}`
    this.commands.push(path)

    // Handle JS function
    if (typeof script === 'function') {
      script = `const main = ${script.toString()}\nmain()`
      if (interpreter === '/bin/sh') {
        interpreter = '/usr/bin/env node'
      }
    }

    const fullScript = `#!${interpreter}\n\n${script}\n`
    await writeFileAsync(path, fullScript)
    await chmodAsync(path, '755')
  }

  async cleanup(): Promise<void> {
    await this.initPromise // Make sure init has finished
    process.env.PATH = this.oldPath
    for (const command of this.commands) {
      await unlinkAsync(command)
    }
    await rmdirAsync(this.tmpdir)
    this.initPromise = Promise.reject(new Error(`Need to run setup again`)).catch(() => {
      // Do nothing as we will throw at later calls
    })
  }

  async getPath(): Promise<string> {
    await this.initPromise // Make sure init has finished
    return this.newPath
  }
}
