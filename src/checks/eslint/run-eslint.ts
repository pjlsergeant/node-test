import { RunProcess } from '../../unix/run-process'

export async function runEslint(): Promise<EslintData[]> {
  const cmd = new RunProcess('eslint', ['--format', 'json', './src/**/*.{ts,tsx}'])
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    data.push(chunk)
  })
  await cmd.waitForStarted()
  await cmd.waitForExit()
  const json = Buffer.concat(data).toString('utf8')
  return JSON.parse(json)
}

export async function runEslintBin(): Promise<EslintData[]> {
  const cmd = new RunProcess('./node_modules/.bin/eslint', ['--format', 'json', './src/**/*.{ts,tsx}'], {})
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    data.push(chunk)
  })
  await cmd.waitForStarted()
  await cmd.waitForExit()
  const json = Buffer.concat(data).toString('utf8')
  return JSON.parse(json)
}
