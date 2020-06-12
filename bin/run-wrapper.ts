#!/usr/bin/env node

import { SpawnOptions } from 'child_process'
import fs from 'fs'
import util from 'util'
import yargs from 'yargs'

import { RunProcess } from '../src/unix'

const writeFileAsync = util.promisify(fs.writeFile)
const openAsync = util.promisify(fs.open)

/**
 * Run a sub process make sure it's stopped when stdin closed or sigkill is sent.
 * @param argv [timeout, command, args...]
 */
async function main(argv: string[]): Promise<number> {
  const { _: args, ...flags } = yargs
    .options({
      stopOnStdinClose: {
        type: 'boolean',
        default: false,
        describe: `Stop wrapped process when stdin closes`
      },
      detached: {
        type: 'boolean',
        default: false,
        describe: `Detaches process and disable echoing to stdout and stderr`
      },
      sigkillTimeout: {
        type: 'number',
        default: 3000,
        describe: `Milliseconds to wait before calling SIGKILL after SIGTERM failed`
      },
      stdoutFile: {
        type: 'string',
        default: '',
        describe: `File to log stdout to`
      },
      stderrFile: {
        type: 'string',
        default: '',
        describe: `File to log stdout to`
      },
      pidFile: {
        type: 'string',
        default: '',
        describe: `PID file location`
      }
    })
    .help()
    .parse(argv.slice(2))

  if (args.length < 1) {
    console.error(`node wrapper.js command args`)
    return 1
  }

  const command = args[0]
  const commandArgs = args.slice(1)

  const options: SpawnOptions = {
    stdio: ['pipe', 'pipe', 'pipe'] // node default
  }

  if (flags.detached) {
    options.detached = true
    options.stdio = [
      'ignore',
      flags['stdoutFile'] ? await openAsync(flags['stdoutFile'], 'w') : 'ignore',
      flags['stderrFile'] ? await openAsync(flags['stderrFile'], 'w') : 'ignore'
    ]
  }

  const cmd = new RunProcess(command, commandArgs, options)
  if (!flags.detached) {
    cmd.stdout?.pipe(process.stdout)
    cmd.stderr?.pipe(process.stderr)
    if (cmd.stdin) {
      process.stdin.pipe(cmd.stdin)
    }
    if (flags['stdoutFile']) {
      const stdoutFile = fs.createWriteStream(flags.stdoutFile)
      cmd.stdout?.pipe(stdoutFile)
    }
    if (flags['stderrFile']) {
      const stderrFile = fs.createWriteStream(flags.stderrFile)
      cmd.stderr?.pipe(stderrFile)
    }
  }

  const exitPromises: Array<Promise<string>> = [
    cmd.waitForExit().then(exitInfo => `process existed(code: ${exitInfo.code}, signal: ${exitInfo.code})`),
    new Promise(resolve => process.on('SIGTERM', () => resolve('SIGTERM'))),
    new Promise(resolve => process.on('SIGINT', () => resolve('SIGINT')))
  ]
  if (flags.stopOnStdinClose) {
    exitPromises.push(new Promise(resolve => process.stdin.on('end', () => resolve('stdin closed'))))
  }

  if (flags.pidFile) {
    await writeFileAsync(flags.pidFile, `${process.pid}`)
  }

  await cmd.waitForStarted()
  console.log(`Started ${command}${commandArgs.length > 0 ? ' ' + commandArgs.join(' ') : ''} with pid ${cmd.pid}`)
  const reason = await Promise.race(exitPromises)
  console.error(`Stopping because ${reason}`)

  const exitInfo = await cmd.stop(flags['sigkillTimeout'])
  return exitInfo.code || 0
}

main(process.argv)
  .then(exitCode => {
    process.exit(exitCode)
  })
  .catch(e => {
    console.error(e)
  })
