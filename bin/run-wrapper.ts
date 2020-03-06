#!/usr/bin/env node

import { RunProcess } from '../src/mysql/run-process'

/**
 * Run a sub process make sure it's stopped when stdin closed or sigkill is sent.
 * @param argv [timeout, command, args...]
 */
async function main(argv: string[]): Promise<number> {
  if (argv.length < 4) {
    console.error(`node wrapper.js 3000 command args`)
    return 1
  }

  const sigkillTimeout = parseInt(argv.slice(2, 3)[0])
  const command = argv.slice(3, 4)[0]
  const args = argv.slice(4)

  const cmd = new RunProcess(command, args)
  cmd.stdout?.pipe(process.stdout)
  cmd.stderr?.pipe(process.stderr)
  if (cmd.stdin) {
    process.stdin.pipe(cmd.stdin)
  }

  const stdinEndPromise = new Promise<string>(resolve => process.stdin.on('end', () => resolve('stdin closed')))
  const sigTermPromise = new Promise<string>(resolve => process.on('SIGTERM', () => resolve('SIGTERM')))
  const reason = await Promise.race([stdinEndPromise, sigTermPromise])
  console.log(`Stopping because of ${reason}`)

  const exitInfo = await cmd.stop(sigkillTimeout)
  return exitInfo.code || 0
}

main(process.argv)
  .then(exitCode => {
    process.exit(exitCode)
  })
  .catch(e => {
    console.error(e)
  })
