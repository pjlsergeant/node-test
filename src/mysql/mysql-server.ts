import fs from 'fs'
import path from 'path'
import util from 'util'

const writeFileAsync = util.promisify(fs.writeFile)
const mkdirAsync = util.promisify(fs.mkdir)

import { findFreePort } from '../net'
import { createTempDirectory, isDockerOverlay2, isPidRunning, readPidFile, stopPid, touchFiles } from '../unix'
import { generateMySQLServerConfig, initializeMySQLData, MySQLServerConfig, readPortFile, startMySQLd } from './common'

export interface MySQLServerOptions {
  mysqlBaseDir?: string
  listenPort?: number
  mysqldPath?: string
  myCnf?: MySQLServerConfig
}

type InitStatus = 'unknown' | 'started' | 'initialized' | 'resumed'

const formatHrDiff = (what: string, diff: [number, number]): string => `${what} ${diff[0]}s ${diff[1] / 1000000}ms`

export class MySQLServer {
  private initStatus: InitStatus = 'unknown'
  private listenPort!: number
  private mysqlBaseDir!: string
  private timings: string[] = []

  private mysqldPath: string
  private myCnfCustom: MySQLServerConfig
  private mysqldPid!: number
  private initPromise: Promise<void>
  private options: MySQLServerOptions

  public constructor(options: MySQLServerOptions = {}) {
    this.options = options
    this.mysqldPath = options.mysqldPath || 'mysqld'
    this.myCnfCustom = options.myCnf || {}
    this.initPromise = this.init()
    this.initPromise.catch(() => {
      // Do nothing as we will throw at later calls
    })
  }

  public async getTimings(): Promise<string[]> {
    await this.initPromise // Make sure init has finished
    return this.timings
  }

  public async getInitStatus(): Promise<InitStatus> {
    await this.initPromise // Make sure init has finished
    return this.initStatus
  }

  public async kill(sigKillTimeout = 3000): Promise<void> {
    await this.initPromise // Make sure init has finished
    await stopPid(this.mysqldPid, sigKillTimeout)
  }

  public async getListenPort(): Promise<number> {
    await this.initPromise // Make sure init has finished
    return this.listenPort
  }

  public async getMysqlBaseDir(): Promise<string> {
    await this.initPromise // Make sure init has finished
    return this.mysqlBaseDir
  }

  public async checkout(database: string, mode = 'ro'): Promise<string> {
    // https://gist.github.com/christopher-hopper/8431737
    // SHOW tables;
    // CREATE DATABASE mysql2;
    // CREATE TABLE mysql2.user LIKE mysql.`user`;
    // INSERT INTO mysql2.`user` SELECT * FROM mysql.user;
    return ''
  }

  private async init(): Promise<void> {
    if (this.options.mysqlBaseDir) {
      this.mysqlBaseDir = path.resolve(this.options.mysqlBaseDir)

      // Check if the mysqld is already running from this folder
      const pid = await readPidFile(`${path.join(this.mysqlBaseDir, '/data/mysqld.local.pid')}`)
      if (pid && (await isPidRunning(pid))) {
        const listenPort = await readPortFile(path.join(this.mysqlBaseDir, '/data/mysqld.port'))
        if (listenPort) {
          this.mysqldPid = pid
          this.listenPort = listenPort
          this.initStatus = 'resumed'
          return
        }
        // Kill the pid if we did not read a listen port
        await stopPid(pid, 3000)
      }
    } else {
      this.mysqlBaseDir = await createTempDirectory()
    }

    // Initialize mysql data
    let initialized = false
    if (!fs.existsSync(`${this.mysqlBaseDir}/data`)) {
      const myCnf: MySQLServerConfig = {}
      if (process.getuid() === 0) {
        // Drop privileges if running as root
        myCnf.mysqld.user = 'mysql'
      }

      // Create base dir
      await mkdirAsync(path.join(this.mysqlBaseDir), { recursive: true, mode: 0o777 })
      const config = generateMySQLServerConfig(this.mysqlBaseDir, { ...myCnf, ...this.myCnfCustom })
      await writeFileAsync(`${path.join(this.mysqlBaseDir, 'my.cnf')}`, config)
      const initializeTime = process.hrtime()
      await initializeMySQLData(this.mysqldPath, this.mysqlBaseDir)
      this.timings.push(formatHrDiff('initializeMySQLData', process.hrtime(initializeTime)))
      initialized = true
    } else if (await isDockerOverlay2()) {
      // Working around issue with docker overlay2
      await touchFiles(this.mysqlBaseDir as string)
    }

    // Find free port and start mysqld
    this.listenPort = this.options.listenPort ? this.options.listenPort : await findFreePort()
    const startTime = process.hrtime()
    this.mysqldPid = await startMySQLd(this.mysqldPath, this.mysqlBaseDir, [`--port=${this.listenPort}`])
    this.timings.push(formatHrDiff('startMySQLd', process.hrtime(startTime)))
    await writeFileAsync(`${path.join(this.mysqlBaseDir, '/data/mysqld.port')}`, this.listenPort)
    this.initStatus = initialized ? 'initialized' : 'started'
  }
}
