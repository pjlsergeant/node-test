import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'

import { CommandEmulation, RunProcess } from '../src/unix'

const execAsync = util.promisify(childProcess.exec)
const fsSymlink = util.promisify(fs.symlink)
const fsUnlink = util.promisify(fs.unlink)

describe('run-wrapper', () => {
  const commandEmulation = new CommandEmulation()

  beforeAll(async () => {
    // Make sure wrapper has been compiled
    await execAsync('npm run build')
    await commandEmulation.registerPath('build/dist/bin')
    try {
      await fsUnlink('build/dist/bin/run-wrapper').catch(e => {
        // TODO: validate that it's no entry we get
      })
      await fsSymlink(path.resolve('build/dist/bin/run-wrapper.js'), 'build/dist/bin/run-wrapper')
    } catch (e) {
      // Ignore
    }
  })

  afterAll(async () => {
    await fsUnlink('build/dist/bin/run-wrapper').catch(e => {
      // TODO: validate that it's no entry we get
    })
  })

  it(`should start a process that stops when we close it's stdin`, async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      setTimeout(() => {
        // Make sure the process keeps running
      }, 10000)
      console.log('Started...')
    })

    const cmd = new RunProcess('run-wrapper', ['3000', 'my-hello'])
    const data: Buffer[] = []
    cmd.stdout?.on('data', chunk => {
      data.push(chunk)
    })
    cmd.stderr?.on('data', chunk => {
      data.push(chunk)
    })

    await cmd.waitForOutput(/Started/)
    cmd.stdin?.end()
    const exitCodePromise = cmd.waitForExit()
    await expect(exitCodePromise).resolves.toEqual({ code: 0, signal: null })
    expect(Buffer.concat(data).toString('utf8')).toEqual('Started...\nStopping because of stdin closed\n')
  })
})
