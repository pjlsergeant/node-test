import fs from 'fs'
import path from 'path'
import util from 'util'

const chmodAsync = util.promisify(fs.chmod)
const mkdirAsync = util.promisify(fs.mkdir)
const writeFileAsync = util.promisify(fs.writeFile)
const readFileAsync = util.promisify(fs.readFile)

import { findFreePort } from '../net'
import { createTempDirectory, isDockerOverlay2, isPidRunning, readPidFile, RunProcess, touchFiles } from '../unix'
import { generateMySQLServerConfig, initializeMySQLData, MySQLServerConfig } from './common'

export interface MySQLServerOptions {
  mysqlBaseDir?: string
  listenPort?: number
  mysqldPath?: string
  myCnf?: MySQLServerConfig
}

export class MySQLServer {
  private listenPort!: number
  private mysqlBaseDir!: string

  private mysqldPath: string
  private myCnfCustom: MySQLServerConfig
  private mysqldPid: number | null = null
  private mySQLServerCmd: RunProcess | null = null
  private initPromise: Promise<void>
  private options: MySQLServerOptions

  constructor(options: MySQLServerOptions = {}) {
    this.options = options
    this.mysqldPath = options.mysqldPath || 'mysqld'
    this.myCnfCustom = options.myCnf || {}
    this.initPromise = this.init()
    this.initPromise.catch(() => {
      // Do nothing as we will throw at later calls
    })
  }

  private async init(): Promise<void> {
    if (this.options.mysqlBaseDir) {
      this.mysqlBaseDir = path.resolve(this.options.mysqlBaseDir)

      // Check if the mysqld is already running from this folder
      const pid = await readPidFile(`${path.join(this.mysqlBaseDir, '/data/mysqld.local.pid')}`)
      if (pid && (await isPidRunning(pid))) {
        try {
          const portStr = await (await readFileAsync(`${path.join(this.mysqlBaseDir, '/data/mysqld.port')}`)).toString(
            'utf8'
          )
          this.listenPort = parseInt(portStr)
          this.mysqldPid = pid
          return
        } catch (e) {
          // Ignore
        }
      }
    } else {
      this.mysqlBaseDir = await createTempDirectory()
    }

    // Make sure mysqlBaseDir exists and has the right permissions, /files is used for LOAD
    await mkdirAsync(path.join(this.mysqlBaseDir, '/files'), { recursive: true, mode: 0o777 })
    await chmodAsync(this.mysqlBaseDir, '777')

    // Initialize mysql data
    if (!fs.existsSync(`${this.mysqlBaseDir}/data`)) {
      const myCnf: MySQLServerConfig = {}
      if (process.getuid() === 0) {
        // Drop privileges if running as root
        myCnf.mysqld.user = 'mysql'
      }
      const config = generateMySQLServerConfig(this.mysqlBaseDir, { ...myCnf, ...this.myCnfCustom })
      await writeFileAsync(`${path.join(this.mysqlBaseDir, 'my.cnf')}`, config)
      await initializeMySQLData(this.mysqldPath, this.mysqlBaseDir)
    } else if (await isDockerOverlay2()) {
      // Working around issue with docker overlay2
      await touchFiles(this.mysqlBaseDir as string)
    }

    // Find free port to start mysqld on
    this.listenPort = this.options.listenPort ? this.options.listenPort : await findFreePort()

    // Start mysql process
    const mysqldStartArgs = [
      `--defaults-file=${this.mysqlBaseDir}/my.cnf`,
      `--port=${this.listenPort}`,
      '--default-authentication-plugin=mysql_native_password'
    ]
    // TODO: Find run-wrapper
    this.mySQLServerCmd = new RunProcess(
      './build/dist/bin/run-wrapper.js',
      ['--', this.mysqldPath, ...mysqldStartArgs],
      {
        env: {
          ...process.env,
          EVENT_NOKQUEUE: '1'
        },
        detached: true
      }
    )
    let serverLog = ''
    this.mySQLServerCmd.stdout?.on('data', chunk => {
      //process.stdout.write(chunk)
      serverLog += chunk.toString('utf8')
    })
    this.mySQLServerCmd.stderr?.on('data', chunk => {
      //process.stderr.write(chunk)
      serverLog += chunk.toString('utf8')
    })

    // 2019-02-04T21:30:25.515625Z 1 [ERROR] [MY-012574] [InnoDB] Unable to lock ./ibdata1 error: 35
    this.mySQLServerCmd.stopOnOutput(/\[ERROR\]\s+\[MY-012574\]/, "Another mySQL instance is running so it can't lock")
    try {
      await this.mySQLServerCmd.waitForOutput(/ready for connections/)
      await writeFileAsync(`${path.join(this.mysqlBaseDir, '/data/mysqld.port')}`, this.listenPort)
    } catch (e) {
      throw new Error(`Failed to start mysqld(${e}): ${serverLog}`)
    }
  }

  async stop(sigKillTimeout = 3000): Promise<void> {
    await this.initPromise // Make sure init has finished
    if (this.mySQLServerCmd) {
      this.mySQLServerCmd.stdin?.end()
      await this.mySQLServerCmd.waitForExit()
    } else if (this.mysqldPid) {
      process.kill(this.mysqldPid, 'SIGTERM')
      const deadline = Date.now() + sigKillTimeout
      while (deadline > Date.now()) {
        await new Promise(resolve => setTimeout(resolve, 100))
        if (!(await isPidRunning(this.mysqldPid))) {
          return
        }
      }
      process.kill(this.mysqldPid, 'SIGKIll')
      while (await isPidRunning(this.mysqldPid)) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }

  async getListenPort(): Promise<number> {
    await this.initPromise // Make sure init has finished
    return this.listenPort
  }

  async getMysqlBaseDir(): Promise<string> {
    await this.initPromise // Make sure init has finished
    return this.mysqlBaseDir
  }
}
