import { FormattedTestResults } from '@jest/test-result/build/types'

import { RunProcess } from '../../unix/run-process'

export async function runJest(command = 'jest', extraArgs: string[] = []): Promise<FormattedTestResults> {
  const cmd = new RunProcess(command, [...extraArgs, '--silent', '--no-color', '--json'], {
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

// Create React App uses a special test command
export async function runReactScriptsTest(): Promise<FormattedTestResults> {
  return runJest('react-scripts', ['test'])
}
