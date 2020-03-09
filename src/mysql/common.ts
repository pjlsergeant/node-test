import fs from 'fs'
import os from 'os'

import { RunProcess } from '../unix'

export interface MySQLServerConfig {
  [key: string]: { [key: string]: string }
}

export async function getMySQLServerVersionString(mysqldPath: string): Promise<string> {
  const cmd = new RunProcess(mysqldPath, ['--version'])
  const outputData: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    outputData.push(chunk)
  })
  cmd.stderr?.on('data', chunk => {
    outputData.push(chunk)
  })
  const code = await new Promise<number>(resolve => cmd.on('exit', code => resolve(code || 0)))
  const stdout = Buffer.concat(outputData).toString('utf8')
  if (code !== 0) {
    throw new Error(`${mysqldPath} --version returned non 0 exit code:\n${stdout}`)
  }
  return stdout.replace(/\r?\n$/, '')
}

export async function getMySQLServerConfig(mysqldPath: string, mysqlBaseDir: string): Promise<MySQLServerConfig> {
  const cmd = new RunProcess(mysqldPath, [`--defaults-file=${mysqlBaseDir}/my.cnf`, '--help', '--verbose'])
  const outputData: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    outputData.push(chunk)
  })
  cmd.stderr?.on('data', chunk => {
    outputData.push(chunk)
  })
  const code = await new Promise<number>(resolve => cmd.on('exit', code => resolve(code || 0)))
  const output = Buffer.concat(outputData).toString('utf8')
  if (code !== 0) {
    throw new Error(`Failed to dump configuration(${mysqldPath} --help --verbose): \n${output}\n`)
  }

  const variables: { [key: string]: string } = {}
  const variablesSection = output.toString().match(/Variables.+?Value.+?-{50,}\s+-{10}.+?\n(.+?)\n\n/s)
  if (variablesSection != null) {
    for (const variableLine of variablesSection[1].split('\n')) {
      const variableMatch = variableLine.match(/^([^\s]+)\s+(.+?)$/)
      if (variableMatch) {
        variables[variableMatch[1]] = variableMatch[2]
      }
    }
  }
  return { mysqld: variables }
}

export function generateMySQLServerConfig(mysqlBaseDir: string, myCnfCustom: MySQLServerConfig = {}): string {
  const myCnf: MySQLServerConfig = {
    // Defaults
    mysqld: {
      'bind-address': '127.0.0.1',
      'pid-file': `${mysqlBaseDir}/data/mysqld.local.pid`,
      socket: `${mysqlBaseDir}/mysql.sock`,
      datadir: `${mysqlBaseDir}/data`,
      // eslint-disable-next-line @typescript-eslint/camelcase
      secure_file_priv: `${mysqlBaseDir}/files`,
      tmpdir: os.tmpdir()
    },
    'mysqld-8.0': {
      mysqlx: '0'
    }
  }

  // Merge configs
  for (const section of Object.keys(myCnfCustom)) {
    for (const key of Object.keys(myCnfCustom[section])) {
      myCnf[section] = myCnf[section] || {}
      myCnf[section][key] = myCnfCustom[section][key]
    }
  }

  const myCnfLines: string[] = []
  for (const section of Object.keys(myCnf)) {
    myCnfLines.push(`[${section}]`)
    for (const key of Object.keys(myCnf[section])) {
      myCnfLines.push(`${key}=${myCnf[section][key]}`)
    }
  }

  return myCnfLines.join(`\n`) + '\n'
}
