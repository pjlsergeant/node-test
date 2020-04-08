import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import util from 'util'

const writeFileAsync = util.promisify(fs.writeFile)
const mkdirAsync = util.promisify(fs.mkdir)
const existsAsync = util.promisify(fs.exists)
const chmodAsync = util.promisify(fs.chmod)
const unlinkAsync = util.promisify(fs.unlink)

import { findFreePort } from '../net'
import {
  createTempDirectory,
  isDockerOverlay2,
  isPidRunning,
  readPidFile,
  stopPid,
  touchFiles,
  writePidFile
} from '../unix'
import {
  createMySQLDataCache,
  extractMySQLDataCache,
  generateMySQLServerConfig,
  getMySQLServerVersionString,
  initializeMySQLData,
  MySQLServerConfig,
  readPortFile,
  startMySQLd
} from './mysqld-utils'

export interface MySQLServerOptions {
  mysqlBaseDir?: string
  listenPort?: number
  mysqldPath?: string
  cachePath?: string
  myCnf?: MySQLServerConfig
  ignoreCache?: boolean
  ignoreCustomCache?: boolean
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
  private cachePath: string
  private cleanInitializeDataTarGz!: string
  private customInitializeDataTarGz!: string
  private ignoreCache: boolean
  private ignoreCustomCache: boolean

  public constructor(options: MySQLServerOptions = {}) {
    this.options = options
    this.mysqldPath = options.mysqldPath || 'mysqld'
    this.cachePath = options.cachePath || './cache'
    this.myCnfCustom = options.myCnf || {}
    this.ignoreCache = options.ignoreCache || false
    this.ignoreCustomCache = (options.ignoreCache && options.ignoreCustomCache) || false
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

  public async kill(sigKillTimeout = 5000): Promise<void> {
    await this.initPromise // Make sure init has finished
    await stopPid(this.mysqldPid, sigKillTimeout)
  }

  public async getListenPort(): Promise<number> {
    await this.initPromise // Make sure init has finished
    return this.listenPort
  }

  public async getConnectionUrl(database: string): Promise<string> {
    await this.initPromise
    return `mysql://root:@127.0.0.1:${this.listenPort}/${database}?charset=utf8mb4&multipleStatements=true`
  }

  public async getMysqlBaseDir(): Promise<string> {
    await this.initPromise // Make sure init has finished
    return this.mysqlBaseDir
  }

  public async saveAsCustomInitState(): Promise<void> {
    await this.initPromise // Make sure init has finished
    await createMySQLDataCache(this.mysqlBaseDir, this.customInitializeDataTarGz)
  }

  public async waitForStarted(): Promise<void> {
    await this.initPromise
  }

  private async init(): Promise<void> {
    // Generate unique cache key based on mysql version
    const mysqlVersion = await getMySQLServerVersionString(this.mysqldPath)
    const hash = crypto.createHash('sha1')
    const cacheCheckSum = hash.update(mysqlVersion).digest('hex') // TODO: Also add calculation for myCnf
    this.cleanInitializeDataTarGz = path.resolve(
      path.join(this.cachePath, `clean-initialization-data-${cacheCheckSum}.tar.gz`)
    )
    this.customInitializeDataTarGz = path.resolve(
      path.join(this.cachePath, `custom-initialization-data-${cacheCheckSum}.tar.gz`)
    )

    // Resume from or create new mysqlBaseDir
    let startingPidFile = ''
    if (this.options.mysqlBaseDir) {
      // TODO: Drop mysqlBaseDir if the version of configuration has changed.
      this.mysqlBaseDir = path.resolve(this.options.mysqlBaseDir)
      // Do simple locking to avoid race condition on startup from existing folder
      startingPidFile = path.join(this.mysqlBaseDir, 'starting.pid')
      await writePidFile(startingPidFile, 100)

      // Check if the mysqld is already running from this folder
      const mysqldPidFile = path.join(this.mysqlBaseDir, 'mysqld.pid')
      const pid = await readPidFile(mysqldPidFile)
      if (pid && (await isPidRunning(pid))) {
        const listenPort = await readPortFile(path.join(this.mysqlBaseDir, 'mysqld.port'))
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
      const myCnf: MySQLServerConfig = {
        mysqld: {},
        'mysqld-8.0': {}
      }
      if (process.getuid() === 0) {
        // Drop privileges if running as root
        myCnf.mysqld.user = 'mysql'
      }
      if (process.platform === 'darwin') {
        // Work around issue with mysql 5.7 running out of FD on macOSX: https://bugs.mysql.com/bug.php?id=79125
        // eslint-disable-next-line @typescript-eslint/camelcase
        myCnf.mysqld.table_open_cache = '250'
        // eslint-disable-next-line @typescript-eslint/camelcase
        myCnf.mysqld.open_files_limit = '800'
        // eslint-disable-next-line @typescript-eslint/camelcase
        myCnf.mysqld.max_connections = '500'

        // Set limits higher for 8.x
        // eslint-disable-next-line @typescript-eslint/camelcase
        myCnf['mysqld-8.0'].max_connections = '2000'
        // eslint-disable-next-line @typescript-eslint/camelcase
        myCnf['mysqld-8.0'].open_files_limit = '5000'
        // eslint-disable-next-line @typescript-eslint/camelcase
        myCnf['mysqld-8.0'].table_open_cache = '2000'
      }

      // Create base dir
      await mkdirAsync(path.join(this.mysqlBaseDir), { recursive: true, mode: 0o777 })
      await chmodAsync(this.mysqlBaseDir, '777')
      const config = generateMySQLServerConfig(this.mysqlBaseDir, { ...myCnf, ...this.myCnfCustom })
      await writeFileAsync(`${path.join(this.mysqlBaseDir, 'my.cnf')}`, config)

      // Make sure /files exists as it is used for LOAD
      await mkdirAsync(path.join(this.mysqlBaseDir, '/files'), { recursive: true, mode: 0o777 })
      await chmodAsync(path.join(this.mysqlBaseDir, '/files'), '777')

      // initialize mysql data folder
      const initializeTime = process.hrtime()
      if (!this.ignoreCustomCache && (await existsAsync(this.customInitializeDataTarGz))) {
        await extractMySQLDataCache(this.mysqlBaseDir, this.customInitializeDataTarGz)
      } else if (!this.ignoreCache && (await existsAsync(this.cleanInitializeDataTarGz))) {
        await extractMySQLDataCache(this.mysqlBaseDir, this.cleanInitializeDataTarGz)
      } else {
        await initializeMySQLData(this.mysqldPath, this.mysqlBaseDir)
        await mkdirAsync(this.cachePath, { recursive: true, mode: 0o777 })
        await createMySQLDataCache(this.mysqlBaseDir, this.cleanInitializeDataTarGz)
      }
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
    await writeFileAsync(`${path.join(this.mysqlBaseDir, '/mysqld.port')}`, this.listenPort)
    this.initStatus = initialized ? 'initialized' : 'started'
    if (startingPidFile) {
      await unlinkAsync(startingPidFile).catch(() => {
        /* Ignore */
      })
    }
  }
}
