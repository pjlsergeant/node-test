import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const unlinkAsync = promisify(fs.unlink)
const rmdirAsync = promisify(fs.rmdir)
const writeFileAsync = promisify(fs.writeFile)
const chmodAsync = promisify(fs.chmod)

import { createTempDirectory, Json } from './common'

interface CommandEmulationOptions {
  overridePath: boolean
}

export class CommandEmulation {
  private tmpdir!: string
  private oldPath!: string
  private newPath!: string
  private commands: string[] = []
  private initPromise: Promise<void>
  private options: CommandEmulationOptions

  constructor(options?: CommandEmulationOptions) {
    this.options = { overridePath: true, ...options }
    this.initPromise = this.init()
    this.initPromise.catch(() => {
      // Do nothing as we will throw at later calls
    })
  }

  static async new(options?: CommandEmulationOptions): Promise<CommandEmulation> {
    const instance = new CommandEmulation(options)
    await instance.initPromise
    return instance
  }

  private async init(): Promise<void> {
    this.tmpdir = await createTempDirectory()
    this.oldPath = process.env.PATH || ''
    this.newPath = this.tmpdir + path.delimiter + this.oldPath

    if (this.options.overridePath) {
      process.env.PATH = this.newPath
    }
  }

  async registerPath(externalPath: string): Promise<void> {
    await this.initPromise // Make sure init has finished
    this.newPath = path.resolve(externalPath) + path.delimiter + this.newPath
    if (this.options.overridePath) {
      process.env.PATH = this.newPath
    }
  }

  async registerCommand<T = Json>(
    cmd: string,
    script: string | ((data: T) => void),
    interpreter: string | null = '/bin/sh',
    data: Json = {}
  ): Promise<string> {
    await this.initPromise // Make sure init has finished

    const path = `${this.tmpdir}/${cmd}`
    this.commands.push(path)

    // Handle JS function
    if (typeof script === 'function') {
      const dataString = JSON.stringify(data)
        .replace(/\\/gs, '\\\\')
        .replace(/`/gs, '\\`')
      const scriptLines = [
        `const jsonData = JSON.parse(\`${dataString}\`)`,
        `const main = ${script.toString()}`,
        `main(jsonData)`
      ]
      script = scriptLines.join('\n')
      if (interpreter === null || interpreter === '/bin/sh') {
        interpreter = '/usr/bin/env node'
      }
    }

    const fullScript = `#!${interpreter}\n\n${script}\n`
    await writeFileAsync(path, fullScript)
    await chmodAsync(path, '755')
    return fullScript
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

  async getTmpdir(): Promise<string> {
    await this.initPromise // Make sure init has finished
    return this.tmpdir
  }

  async getPath(): Promise<string> {
    await this.initPromise // Make sure init has finished
    return this.newPath
  }
}
