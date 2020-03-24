import crypto from 'crypto'
import mysql from 'mysql'

export type MySQLClientOptions = mysql.PoolConfig

export class MySQLClient {
  private databasePools: { [key: string]: mysql.Pool } = {}
  private options: MySQLClientOptions

  public constructor(options: MySQLClientOptions = {}) {
    this.options = {
      host: '127.0.0.1',
      user: 'root',
      password: '',
      connectionLimit: 100,
      insecureAuth: true,
      multipleStatements: true,
      ...options
    }
  }

  public async getConnectionPool(database: string, cache = true): Promise<mysql.Pool> {
    let pool = cache ? this.databasePools[database] : null
    if (!pool) {
      pool = mysql.createPool({
        ...this.options,
        database: database
      })
      if (cache) {
        this.databasePools[database] = pool
      }
    }
    return pool
  }

  public async query<T extends { [key: string]: unknown }>(
    pool: mysql.Pool | mysql.Connection,
    sql: string,
    values?: string[]
  ): Promise<T[]> {
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
  public async createDatabaseCopy(database: string, tables: string[] = []): Promise<mysql.Pool> {
    // TODO: Look into reusing the copied database "SELECT TABLE_NAME, UPDATE_TIME FROM information_schema.tables;"
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

      return this.getConnectionPool(destinationDatabase)
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

  public async cleanup(): Promise<void> {
    for (const database of Object.keys(this.databasePools)) {
      await new Promise(resolve => this.databasePools[database].end(resolve))
      delete this.databasePools[database]
    }
  }
}
