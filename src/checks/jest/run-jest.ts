import { FormattedTestResults } from '@jest/test-result/build/types'

import { RunProcess } from '../../unix/run-process'

export async function runJestBin(): Promise<FormattedTestResults> {
  const cmd = new RunProcess('./node_modules/.bin/jest', ['--silent', '--no-color', '--json'], {
    env: { ...process.env, TZ: 'UTC' }
  })
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    data.push(chunk)
  })
  await cmd.waitForStarted()
  await cmd.waitForExit()
  const json = Buffer.concat(data).toString('utf8')
  return JSON.parse(json)
}

export async function runJest(): Promise<FormattedTestResults> {
  const cmd = new RunProcess('jest', ['--silent', '--no-color', '--json'], {
    env: { ...process.env, TZ: 'UTC' }
  })
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    data.push(chunk)
  })
  await cmd.waitForStarted()
  await cmd.waitForExit()
  const json = Buffer.concat(data).toString('utf8')
  return JSON.parse(json)
}

export async function runReactScriptsTest(): Promise<string> {
  const cmd = new RunProcess('react-scripts test', ['--silent', '--no-color', '--json'], {
    env: { ...process.env, TZ: 'UTC', CI: 'true' }
  })
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    data.push(chunk)
  })

  await cmd.waitForStarted()
  await cmd.waitForExit()

  const json = Buffer.concat(data).toString('utf8')
  return JSON.parse(json)
}
