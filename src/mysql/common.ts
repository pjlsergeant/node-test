import fs from 'fs'
import os from 'os'
import path from 'path'
import util from 'util'

import { RunProcess } from '../unix'
import { isFileNotFoundError } from '../unix/errors'

const fsExistsAsync = util.promisify(fs.exists)
const readFileAsync = util.promisify(fs.readFile)
const chmodAsync = util.promisify(fs.chmod)
const mkdirAsync = util.promisify(fs.mkdir)

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

export function generateMySQLServerConfig(
  mysqlBaseDir: string,
  myCnfCustom: MySQLServerConfig = {},
  tmpdir = os.tmpdir()
): string {
  const myCnf: MySQLServerConfig = {
    // Defaults
    mysqld: {
      'bind-address': '127.0.0.1',
      'pid-file': `${mysqlBaseDir}/data/mysqld.local.pid`,
      socket: `${mysqlBaseDir}/mysql.sock`,
      datadir: `${mysqlBaseDir}/data`,
      // eslint-disable-next-line @typescript-eslint/camelcase
      secure_file_priv: `${mysqlBaseDir}/files`,
      tmpdir
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

export async function initializeMySQLData(mysqldPath: string, mysqlBaseDir: string): Promise<void> {
  // Make sure mysqlBaseDir exists and has the right permissions, /files is used for LOAD
  await mkdirAsync(path.join(mysqlBaseDir, '/files'), { recursive: true, mode: 0o777 })
  await chmodAsync(mysqlBaseDir, '777')

  // Initialize mysql data
  const mysqlInitArgs = [
    `--defaults-file=${mysqlBaseDir}/my.cnf`,
    '--default-authentication-plugin=mysql_native_password',
    '--initialize-insecure'
  ]
  let initializeLog = `${mysqldPath} ${mysqlInitArgs.join(' ')}\n`
  const cmd = new RunProcess(mysqldPath, mysqlInitArgs, {
    env: {
      ...process.env,
      EVENT_NOKQUEUE: '1'
    }
  })
  cmd.stdout?.on('data', chunk => {
    initializeLog += chunk.toString('utf8')
  })
  cmd.stderr?.on('data', chunk => {
    initializeLog += chunk.toString('utf8')
  })
  const exitInfo = await cmd.waitForExit()
  if (exitInfo.code !== 0) {
    throw new Error(`Failed to initialize ${mysqldPath}: ${initializeLog}`)
  }
}

export async function startMySQLd(
  mysqldPath: string,
  mysqlBaseDir: string,
  mysqldServerArgs: string[] = []
): Promise<number> {
  const stdoutPath = `${mysqlBaseDir}/stdout.log`
  const stderrPath = `${mysqlBaseDir}/stderr.log`

  const cmd = new RunProcess(
    './build/dist/bin/run-wrapper.js',
    [
      `--stdout-file=${stdoutPath}`,
      `--stderr-file=${stderrPath}`,
      `--detached`,
      '--',
      mysqldPath,
      `--defaults-file=${mysqlBaseDir}/my.cnf`,
      '--default-authentication-plugin=mysql_native_password',
      ...mysqldServerArgs
    ],
    {
      env: {
        ...process.env
        // TODO Try to disable on mac
        // EVENT_NOKQUEUE: '1'
      }
    }
  )

  const match = await cmd.waitForOutput(/.*with pid (\d+).*/s)
  await cmd.waitForExit()
  const pid = parseInt(match[1])

  // Start polling the stderr file to see if mysql failed to start
  const deadline = Date.now() + 10000
  let mysqlStarted = false
  let stderr = ''
  while (deadline > Date.now()) {
    await new Promise(resolve => setTimeout(resolve, 100))
    // TODO: Only read the change since last amount
    try {
      stderr = (await readFileAsync(stderrPath)).toString('utf8')
      // 2019-02-04T21:30:25.515625Z 1 [ERROR] [MY-012574] [InnoDB] Unable to lock ./ibdata1 error: 35
      if (stderr.match(/\[ERROR\]\s+\[MY-012574\]/)) {
        throw new Error("Another mySQL instance is running so it can't lock")
      }
      if (stderr.match(/ready for connections/)) {
        mysqlStarted = true
        break
      }
    } catch (e) {
      if (!isFileNotFoundError(e)) {
        throw e
      }
    }
  }

  if (!mysqlStarted) {
    throw new Error(`Failed to start mysql:\n${stderr}`)
  }

  return pid
}

export async function readPortFile(path: string): Promise<number> {
  if (!(await fsExistsAsync(path))) {
    return 0
  }
  const portStr = (await readFileAsync(path)).toString('utf8')
  return parseInt(portStr)
}
