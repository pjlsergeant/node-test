import fs from 'fs'
import os from 'os'
import path from 'path'
import util from 'util'

import { RunProcess } from '../unix'
import { isFileNotFoundError } from '../unix/errors'

const fsExistsAsync = util.promisify(fs.exists)
const readFileAsync = util.promisify(fs.readFile)
const unlinkAsync = util.promisify(fs.unlink)

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
      'pid-file': `${mysqlBaseDir}/mysqld.pid`,
      socket: `${mysqlBaseDir}/mysqld.sock`,
      datadir: `${mysqlBaseDir}/data`,
      // eslint-disable-next-line @typescript-eslint/camelcase
      secure_file_priv: `${mysqlBaseDir}/files`,
      tmpdir,
      // eslint-disable-next-line @typescript-eslint/camelcase
      max_allowed_packet: '256M'
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

export async function extractMySQLDataCache(mysqlBaseDir: string, initializeDataTarGz: string): Promise<void> {
  const cmd = new RunProcess('tar', ['-xzf', initializeDataTarGz], {
    cwd: path.resolve(mysqlBaseDir)
  })
  cmd.stdin?.end()
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => data.push(chunk))
  cmd.stderr?.on('data', chunk => data.push(chunk))
  await cmd.waitForStarted()
  const exitInfo = await cmd.waitForExit()
  if (exitInfo.code !== 0) {
    const output = Buffer.concat(data).toString('utf8')
    throw new Error(`Failed to extract cached data folder ${initializeDataTarGz} to ${mysqlBaseDir}\n${output}`)
  }
}

export async function createMySQLDataCache(mysqlBaseDir: string, initializeDataTarGz: string): Promise<void> {
  const cmd = new RunProcess('tar', ['-czf', path.resolve(initializeDataTarGz), 'data'], {
    cwd: path.resolve(mysqlBaseDir)
  })
  cmd.stdin?.end()
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => data.push(chunk))
  cmd.stderr?.on('data', chunk => data.push(chunk))
  await cmd.waitForStarted()
  const exitInfo = await cmd.waitForExit()
  if (exitInfo.code !== 0) {
    const output = Buffer.concat(data).toString('utf8')
    throw new Error(`Failed to create ${initializeDataTarGz} of cached data in ${mysqlBaseDir}\n${output}`)
  }
}

export async function dumpDatabase(port: number, databases: string[], dumpFile: string): Promise<void> {
  const cmd = new RunProcess('mysqldump', [
    '--host=127.0.0.1',
    `--port=${port}`,
    '--user=root',
    '--databases',
    ...databases
  ])
  cmd.stdin?.end()
  const data: Buffer[] = []
  cmd.stderr?.on('data', chunk => data.push(chunk))
  const dumpFileStream = fs.createWriteStream(dumpFile)
  cmd.stdout?.pipe(dumpFileStream)
  await cmd.waitForStarted()
  const exitInfo = await cmd.waitForExit()
  if (exitInfo.code !== 0) {
    const output = Buffer.concat(data).toString('utf8')
    throw new Error(`Failed to dump ${databases.join(', ')} to ${dumpFile}\n${output}`)
  }
}

export async function startMySQLd(
  mysqldPath: string,
  mysqlBaseDir: string,
  mysqldServerArgs: string[] = []
): Promise<number> {
  const stdoutPath = `${mysqlBaseDir}/stdout.log`
  const stderrPath = `${mysqlBaseDir}/stderr.log`

  // Make sure we remove old output so we don't end up parsing that
  unlinkAsync(stdoutPath).catch(() => {
    // Ignore
  })
  unlinkAsync(stderrPath).catch(() => {
    // Ignore
  })

  const cmd = new RunProcess(
    path.resolve(`${__dirname}/../../bin/run-wrapper.js`),
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
