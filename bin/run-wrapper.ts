#!/usr/bin/env node

import args from 'args'
import fs from 'fs'

import { RunProcess } from '../src/unix'

/**
 * Run a sub process make sure it's stopped when stdin closed or sigkill is sent.
 * @param argv [timeout, command, args...]
 */
async function main(argv: string[]): Promise<number> {
  args.options([
    {
      name: 'stop-on-stdin-close',
      description: `Stop wrapped process when stdin closes`,
      init: content => content,
      defaultValue: false
    },
    {
      name: 'sigkill-timeout',
      description: `Milliseconds to wait before calling SIGKILL after SIGTERM failed`,
      init: content => content,
      defaultValue: 3000
    },
    {
      name: 'stdout-file',
      description: `File to log stdout to`,
      init: content => content,
      defaultValue: ''
    },
    {
      name: 'stderr-file',
      description: `File to log stderr to`,
      init: content => content,
      defaultValue: ''
    }
  ])
  const flags = args.parse(argv)

  if (args.sub.length < 1) {
    console.error(`node wrapper.js command args`)
    return 1
  }

  const command = args.sub[0]
  const commandArgs = args.sub.slice(1)

  const cmd = new RunProcess(command, commandArgs)
  cmd.stdout?.pipe(process.stdout)
  cmd.stderr?.pipe(process.stderr)
  if (cmd.stdin) {
    process.stdin.pipe(cmd.stdin)
  }

  if (flags['stdoutFile']) {
    const stdoutFile = fs.createWriteStream(flags['stdoutFile'])
    cmd.stdout?.pipe(stdoutFile)
  }
  if (flags['stderrFile']) {
    const stderrFile = fs.createWriteStream(flags['stderrFile'])
    cmd.stderr?.pipe(stderrFile)
  }

  const exitPromises: Array<Promise<string>> = [
    cmd.waitForExit().then(exitInfo => `process existed(code: ${exitInfo.code}, signal: ${exitInfo.code})`),
    new Promise(resolve => process.on('SIGTERM', () => resolve('SIGTERM'))),
    new Promise(resolve => process.on('SIGINT', () => resolve('SIGINT')))
  ]
  if (flags['stopOnStdinClose']) {
    exitPromises.push(new Promise(resolve => process.stdin.on('end', () => resolve('stdin closed'))))
  }

  await cmd.waitForStarted()
  console.log(`Started ${command}${commandArgs.length > 0 ? ' ' + commandArgs.join(' ') : ''}`)
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
