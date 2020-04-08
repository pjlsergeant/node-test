import crypto from 'crypto'
import mysql from 'mysql'

export type MySQLClientOptions = mysql.PoolConfig

export class MySQLClient {
  public options: MySQLClientOptions
  private databasePools: { [key: string]: mysql.Pool } = {}

  public constructor(options: MySQLClientOptions = {}) {
    this.options = {
      host: '127.0.0.1',
      user: 'root',
      password: '',
      connectionLimit: 10,
      insecureAuth: true,
      multipleStatements: true,
      charset: 'utf8mb4',
      ...options
    }
  }

  public async getConnectionPool(database: string, cache = true, options?: MySQLClientOptions): Promise<mysql.Pool> {
    let pool = cache ? this.databasePools[database] : null
    if (!pool) {
      pool = mysql.createPool({
        ...this.options,
        ...options,
        database: database
      })
      if (cache) {
        this.databasePools[database] = pool
      }
    }
    return pool
  }

  public async query<T>(pool: mysql.Pool | mysql.Connection, sql: string, values?: string[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      pool.query(sql, values, (error, results) => {
        if (error) {
          return reject(error)
        }
        return resolve(results as [])
      })
    })
  }

  public async queryArray<T>(pool: mysql.Pool | mysql.Connection, sql: string, values?: string[]): Promise<T[]> {
    const result = await this.query<{ [key: string]: T }>(pool, sql, values)
    if (result.length == 0) {
      return []
    }
    const column = Object.keys(result[0])[0]
    return result.map(r => r[column])
  }

  public async createTmpDatabase(): Promise<string> {
    const pool = await this.getConnectionPool('mysql')
    const database = 'tmp-' + crypto.randomBytes(4).toString('hex')
    await this.query(
      pool,
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`
    )
    return database
  }

  public async dropDatabase(database: string): Promise<void> {
    const pool = await this.getConnectionPool('mysql')
    await this.query(pool, `DROP DATABASE IF EXISTS \`${database}\`;`)
  }

  // https://gist.github.com/christopher-hopper/8431737
  public async createDatabaseCopy(database: string, tables: string[] = []): Promise<mysql.Pool> {
    // TODO: Look into reusing the copied database "SELECT TABLE_NAME, UPDATE_TIME FROM information_schema.tables;"
    let pool: mysql.Pool | null = null
    try {
      // Disable foreign keys for these connections
      pool = await this.getConnectionPool(database, false, { connectionLimit: 10 })
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
