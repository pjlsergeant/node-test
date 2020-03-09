import { ChildProcess, spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { findFreePort } from '../net'
import { createTempDirectory, isDockerOverlay2, isPidFileRunning, touchFiles } from '../unix'

interface MySQLServerOptions {
  mysqlBaseDir?: string
  listenPort?: number
  mysqldPath?: string
  myCnf?: { [key: string]: { [key: string]: unknown } }
  waitForAccess?: boolean
}

function hrDiff(start: [number, number], end: [number, number]): number {
  return (end[0] - start[0]) * 1000 + (end[1] - start[1]) / 1000000
}

export class MySQLServer {
  public listenPort: number

  private initializeLog = ''
  private serverLog = ''
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  private myCnf: { [key: string]: { [key: string]: unknown } }
  private initializeTime = 0
  private startTime = 0
  private mysqlBaseDir: string | null = null
  private mysqldPath: string
  public started = false
  private stopped = false
  private myCnfCustom?: { [key: string]: { [key: string]: unknown } }
  private mysqlPidFile!: string
  private waitForAccess: boolean

  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  private mysqldCmd: ChildProcess
  private tmpDir!: string

  private initPromise: Promise<void>

  constructor(options: MySQLServerOptions = {}) {
    this.mysqlBaseDir = options.mysqlBaseDir ? path.resolve(options.mysqlBaseDir) : null
    this.listenPort = options.listenPort ? options.listenPort : 0
    this.mysqldPath = options.mysqldPath ? options.mysqldPath : 'mysqld'
    this.myCnfCustom = options.myCnf
    this.waitForAccess = options.waitForAccess ? options.waitForAccess : true

    this.initPromise = this.init()
    this.initPromise.catch(() => {
      // Do nothing as we will throw at later calls
    })
  }

  public async init(): Promise<void> {
    if (this.mysqlBaseDir == null) {
      this.tmpDir = await createTempDirectory()
      this.mysqlBaseDir = path.resolve(`${this.tmpDir}`)
      fs.chmodSync(this.mysqlBaseDir, '777')
    }
    this.mysqlBaseDir = await MySQLServer.createMySQLBaseDir(this.mysqlBaseDir)
    this.mysqlPidFile = `${this.mysqlBaseDir}/data/mysqld.local.pid`
  }

  private static async createMySQLBaseDir(mysqlBaseDir: string): Promise<string> {
    if (!fs.existsSync(mysqlBaseDir)) {
      fs.mkdirSync(mysqlBaseDir, { recursive: true, mode: 0o777 })
      fs.chmodSync(mysqlBaseDir, '777')
    }
    if (!fs.existsSync(`${mysqlBaseDir}/files`)) {
      // Create folder for mysql to do LOAD from
      fs.mkdirSync(`${mysqlBaseDir}/files`, { recursive: true, mode: 0o777 })
    }
    return mysqlBaseDir
  }

  public async start(): Promise<number> {
    await this.initPromise // Make sure init has finished

    // Check if mysql is already running
    while (await isPidFileRunning(this.mysqlPidFile)) {
      const errorMessage = `mysqld already running from this basedir: ${this.mysqlBaseDir}`
      if (!this.waitForAccess) {
        throw new Error(errorMessage)
      }
      console.error(`${errorMessage}, waiting 1 second before trying again`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    if (!fs.existsSync(`${this.mysqlBaseDir}/data`)) {
      const initializeStartTime = process.hrtime()
      await this.initialize()
      this.initializeTime = hrDiff(initializeStartTime, process.hrtime())
    } else if (await isDockerOverlay2()) {
      this.serverLog += `Working around issue with docker overlay2\n`
      await touchFiles(this.mysqlBaseDir as string)
    }

    if (this.listenPort === 0) {
      this.listenPort = await findFreePort()
    }
    const mysqlArgs = [
      `--defaults-file=${this.mysqlBaseDir}/my.cnf`,
      `--port=${this.listenPort}`,
      '--default-authentication-plugin=mysql_native_password'
    ]

    this.serverLog += `${this.mysqldPath} ${mysqlArgs.join(' ')}\n`
    const mysqldStartTime = process.hrtime()
    this.mysqldCmd = spawn(this.mysqldPath, mysqlArgs, {
      env: {
        ...process.env,
        EVENT_NOKQUEUE: '1'
      }
    })
    this.mysqldCmd.stdin?.end()

    // Make sure we always kill mySQL so it does not linger
    const killMySQLd = (): void => {
      if (!this.stopped) {
        this.mysqldCmd.kill()
        this.stopped = true
      }
    }
    process.on('SIGINT', killMySQLd)
    process.on('SIGTERM', killMySQLd)
    process.on('exit', killMySQLd)

    // Capture all output
    this.mysqldCmd.stdout?.on('data', data => {
      this.serverLog += data.toString('utf8')
    })

    const stdOutPromise = new Promise(resolve => {
      this.mysqldCmd.stdout?.on('end', () => {
        resolve()
      })
    })
    const stdErrPromise = new Promise(resolve => {
      this.mysqldCmd.stderr?.on('end', () => {
        resolve()
      })
    })
    const exitPromise = new Promise<number>(resolve => {
      this.mysqldCmd.on('exit', code => {
        resolve(code || 0)
      })
    })

    return new Promise((resolve, reject) => {
      // TODO: Replace this with a loop that tries to make a connection and a query
      this.mysqldCmd.stderr?.on('data', data => {
        this.serverLog += data.toString('utf8')
        if (!this.started && this.serverLog.match(/ready for connections/)) {
          this.started = true
          this.startTime = hrDiff(mysqldStartTime, process.hrtime())
          resolve(this.listenPort)
        }
        // 2019-02-04T21:30:25.515625Z 1 [ERROR] [MY-012574] [InnoDB] Unable to lock ./ibdata1 error: 35
        if (!this.mysqldCmd.killed && this.serverLog.match(/\[ERROR\]\s+\[MY-012574\]/)) {
          // Another mySQL instance is running so it can't lock
          this.mysqldCmd.kill('SIGKILL')
        }
      })

      // Wait for stdout, stderr and exit to finish so we get all data and the exit code
      Promise.all([exitPromise, stdOutPromise, stdErrPromise])
        .then(results => {
          const code = results[0]
          if (!this.started) {
            this.serverLog += `\nexit: ${code}`
            reject(new Error(`Failed to start mysqld: init:\n${this.initializeLog}\nrun:\n${this.serverLog}`))
          }
        })
        .catch(e => {
          console.error(e)
        })
    })
  }

  public async stop(): Promise<void> {
    await this.initPromise // Make sure init has finished

    if (this.stopped) {
      return
    }

    // Kill mySQL
    const mysqlExitPromise = new Promise(resolve => {
      this.mysqldCmd.on('exit', (code, signal) => {
        this.serverLog += `exit: ${code}`
        resolve({ code, signal })
      })
    })
    this.mysqldCmd.kill()
    await mysqlExitPromise
    this.stopped = true

    if (this.tmpDir) {
      // TODO: Do cleanup
    }
  }

  public async initialize(): Promise<void> {
    await this.initPromise // Make sure init has finished

    const myCnfDefaults: { mysqld: { [key: string]: unknown } } = {
      mysqld: {
        'bind-address': '127.0.0.1',
        'pid-file': `${this.mysqlBaseDir}/data/mysqld.local.pid`,
        socket: `${this.mysqlBaseDir}/mysql.sock`,
        datadir: `${this.mysqlBaseDir}/data`,
        // eslint-disable-next-line @typescript-eslint/camelcase
        secure_file_priv: `${this.mysqlBaseDir}/files`,
        tmpdir: os.tmpdir
      }
    }

    // Only set mysql user if we are running as root
    if (process.getuid() === 0) {
      myCnfDefaults.mysqld.user = 'mysql'
    }

    // Disable the mysql x stuff on 8.x
    const mysqlVersion = spawnSync(this.mysqldPath, ['--version'])
    if (mysqlVersion.status !== 0) {
      throw new Error(`Failed to get mysql version(${this.mysqldPath} --version):\n${mysqlVersion.output.toString()}`)
    }
    if (mysqlVersion.stdout.toString().match(/^mysqld.*?Ver\s+8\.\d+\.\d+/)) {
      myCnfDefaults.mysqld.mysqlx = '0'
    }

    // Set my.cnf default
    this.myCnf = {
      ...myCnfDefaults,
      ...this.myCnfCustom
    }

    // Write my.cnf
    const myCnfLines: string[] = []
    for (const section of Object.keys(this.myCnf)) {
      myCnfLines.push(`[${section}]`)
      for (const key of Object.keys(this.myCnf[section])) {
        myCnfLines.push(`${key}=${this.myCnf[section][key]}`)
      }
    }
    fs.writeFileSync(`${this.mysqlBaseDir}/my.cnf`, myCnfLines.join(`\n`) + '\n')

    // Initialize mysql data
    const mysqlArgs = [
      `--defaults-file=${this.mysqlBaseDir}/my.cnf`,
      '--default-authentication-plugin=mysql_native_password',
      '--initialize-insecure'
    ]
    this.initializeLog += `${this.mysqldPath} ${mysqlArgs.join(' ')}\n`
    const mysqldCmd = spawn(this.mysqldPath, mysqlArgs, {
      env: {
        ...process.env,
        EVENT_NOKQUEUE: '1'
      }
    })
    mysqldCmd.stdin.end()

    mysqldCmd.stdout.on('data', data => {
      this.initializeLog += data.toString('utf8')
    })
    mysqldCmd.stderr.on('data', data => {
      this.initializeLog += data.toString('utf8')
    })

    const stdOutPromise = new Promise(resolve => {
      mysqldCmd.stdout.on('end', () => {
        resolve()
      })
    })
    const stdErrPromise = new Promise(resolve => {
      mysqldCmd.stderr.on('end', () => {
        resolve()
      })
    })
    const exitPromise = new Promise<number>(resolve => {
      mysqldCmd.on('exit', code => {
        resolve(code || 0) // TODO: Add signal
      })
    })

    const results = await Promise.all([exitPromise, stdOutPromise, stdErrPromise])
    const exitCode = results[0]
    this.initializeLog += `\nexit: ${exitCode}`
    if (exitCode !== 0) {
      const myCnf = fs.readFileSync(`${this.mysqlBaseDir}/my.cnf`).toString()
      throw new Error(`Failed to initialize: ${this.initializeLog}\n${myCnf}`)
    }
  }
}
