import { RunProcess } from '../../unix/run-process'

export async function runMocha(command = 'mocha', extraArgs: string[] = []): Promise<MochaData> {
  const cmd = new RunProcess(command, [...extraArgs, 'src/**/*.test.js', '--reporter=json'], {
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
