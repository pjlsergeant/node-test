import { RunProcess } from '../../unix/run-process'
import { AuditData } from './audit-types'

export async function runNpmAudit(command = 'npm', extraArgs: string[] = []): Promise<AuditData> {
  const cmd = new RunProcess(command, ['audit', '--json', ...extraArgs], {
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
