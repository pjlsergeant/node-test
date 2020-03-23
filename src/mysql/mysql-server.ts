import crypto from 'crypto'
import fs from 'fs'
import mysql from 'mysql'
import path from 'path'
import util from 'util'

const writeFileAsync = util.promisify(fs.writeFile)
const mkdirAsync = util.promisify(fs.mkdir)

import { findFreePort } from '../net'
import { createTempDirectory, isDockerOverlay2, isPidRunning, readPidFile, stopPid, touchFiles } from '../unix'
import {
  generateMySQLServerConfig,
  initializeMySQLData,
  MySQLServerConfig,
  readPortFile,
  startMySQLd
} from './mysqld-utils'

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
  private databasePools: { [key: string]: mysql.Pool } = {}

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

  public async getConnectionPool(database: string, cache = true): Promise<mysql.Pool> {
    await this.initPromise // Make sure init has finished
    let pool = cache ? this.databasePools[database] : null
    if (!pool) {
      pool = mysql.createPool({
        host: '127.0.0.1',
        user: 'root',
        password: '',
        database: database,
        connectionLimit: 100,
        insecureAuth: true,
        multipleStatements: true
      })
      if (cache) {
        this.databasePools[database] = pool
      }
    }
    return pool
  }

  public async cleanup(): Promise<void> {
    for (const database of Object.keys(this.databasePools)) {
      await new Promise(resolve => this.databasePools[database].end(resolve))
      delete this.databasePools[database]
    }
  }

  public async query<T extends { [key: string]: unknown }>(
    pool: mysql.Pool | mysql.Connection,
    sql: string,
    values?: string[]
  ): Promise<T[]> {
    await this.initPromise // Make sure init has finished
    console.log(sql)
    return new Promise((resolve, reject) => {
      pool.query(sql, values, (error, results) => {
        if (error) {
          return reject(error)
        }
        return resolve(results as [])
      })
    })
  }

  // https://gist.github.com/christopher-hopper/8431737
  public async checkout(database: string, mode = 'ro'): Promise<string> {
    await this.initPromise // Make sure init has finished

    let pool: mysql.Pool | null = null
    try {
      // Disable foreign keys for these connections
      pool = await this.getConnectionPool(database, false)
      pool.on('connection', connection => {
        connection.query(`
          SET SESSION FOREIGN_KEY_CHECKS=0;
          SET SQL_MODE='ALLOW_INVALID_DATES'
        `)
      })

      // Create target database
      const databasePostfix = crypto.randomBytes(2).toString('hex')
      const destinationDatabase = `${database}-${databasePostfix}`
      await this.cloneDatabase(pool, destinationDatabase)

      return destinationDatabase
    } finally {
      pool?.end()
    }
  }

  public async cloneDatabase(pool: mysql.Pool, destinationDatabase: string): Promise<void> {
    // Fetch charset and collation from source database
    const dbInfo = await this.query<{ charset: string; collation: string }>(
      pool,
      `
        SELECT default_character_set_name AS 'charset', DEFAULT_COLLATION_NAME AS 'collation'
        FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();
      `
    )

    await this.query(
      pool,
      `
        CREATE DATABASE \`${destinationDatabase}\` CHARACTER SET ${dbInfo[0].charset} COLLATE ${dbInfo[0].collation};
      `
    )

    // Copy all tables from source to target database
    const tables = await this.query<{ name: string }>(
      pool,
      `
        SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE();
      `
    )

    const promises: Promise<void>[] = []
    for (const table of tables) {
      promises.push(this.cloneTable(pool, table.name, destinationDatabase, table.name))
    }
    await Promise.all(promises)
  }

  public async cloneTable(
    pool: mysql.Pool,
    sourceTable: string,
    destinationDatabase: string,
    destinationTable: string
  ): Promise<void> {
    await this.query(
      pool,
      `
        CREATE TABLE \`${destinationDatabase}\`.\`${destinationTable}\` LIKE \`${sourceTable}\`;
        ALTER TABLE \`${destinationDatabase}\`.\`${destinationTable}\` DISABLE KEYS;
        INSERT INTO \`${destinationDatabase}\`.\`${destinationTable}\` SELECT * FROM \`${sourceTable}\`;
        ALTER TABLE \`${destinationDatabase}\`.\`${destinationTable}\` ENABLE KEYS;
      `
    )
  }

  private async init(): Promise<void> {
    if (this.options.mysqlBaseDir) {
      // TODO: Drop mysqlBaseDir if the version of configuration has changed.
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

      // TODO: Cache initializeMySQLData
      // time tar -czf mysql-context.tar.gz mysql-context/
      // real	0m0.932s
      // user	0m0.862s
      // sys	0m0.057s
      // time tar -xzf mysql-context.tar.gz
      // real	0m0.393s
      // user	0m0.222s
      // sys	0m0.158s

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
