import fs from 'fs'
import mysql from 'mysql'
import util from 'util'

import { MySQLClient } from './mysql-client'

const readdir = util.promisify(fs.readdir)
const readFile = util.promisify(fs.readFile)

interface MigrationRow {
  timestamp: string
  name: string
}

export interface MigrateOptions {
  mysqlClient: MySQLClient
  migrationsDir?: string
  cacheDir?: string
}

export class Migrate {
  private mysqlClient: MySQLClient
  private migrationsDir: string
  private cacheDir: string
  private initPromise: Promise<void>
  private databases!: string
  private schemaFolders!: string[]
  private databaseMap!: { [key: string]: string[] }
  private basePool!: mysql.Pool

  public constructor(options: MigrateOptions) {
    this.mysqlClient = options.mysqlClient
    this.migrationsDir = options.migrationsDir || './migrations'
    this.cacheDir = options.cacheDir || './cache'
    this.initPromise = this.init()
    this.initPromise.catch(() => {
      // Ignore so we don't et unhandled promise rejection
    })
  }

  public async init(): Promise<void> {
    const [databasesJSON, schemaFolders] = await Promise.all([
      readFile(`${this.migrationsDir}/databases.json`, 'utf8'),
      readdir(this.migrationsDir)
    ])
    this.databaseMap = JSON.parse(databasesJSON)
    this.schemaFolders = schemaFolders.filter(s => s in this.databaseMap)

    this.basePool = await this.mysqlClient.getConnectionPool('mysql')
  }

  public async cleanup(): Promise<void> {
    await this.initPromise
    for (const schemaFolder of this.schemaFolders) {
      for (const database of this.databaseMap[schemaFolder]) {
        await this.mysqlClient.dropDatabase(database)
      }
    }
  }

  public async run(until?: string): Promise<void> {
    await this.initPromise
    for (const schemaFolder of this.schemaFolders) {
      console.log(`Running migrations for "${schemaFolder}"...`)
      for (const database of this.databaseMap[schemaFolder]) {
        // TODO: Restore cache if it exists

        // Create the database and migration if they do not exist
        await this.mysqlClient.query(
          this.basePool,
          `
            CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
            CREATE TABLE IF NOT EXISTS \`${database}\`.Migrations (
              id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
              timestamp VARCHAR(255) NOT NULL,
              name VARCHAR(255) NOT NULL,
              createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
            );
          `
        )
        const pool = await this.mysqlClient.getConnectionPool(database)

        // Fetch applied migrations
        const appliedMigrations = await this.mysqlClient.query<MigrationRow>(
          pool,
          'SELECT `timestamp`, `name` FROM `Migrations`'
        )

        // Try to apply new migrations
        const migrations = (await readdir(`${this.migrationsDir}/${schemaFolder}`)).sort()
        for (const migrationFile of migrations) {
          const match = migrationFile.match(/^([^_]+)_([^.]+\.sql)$/)
          if (!match) {
            throw new Error(`Migration file does not follow format: ${migrationFile}`)
          }
          const timestamp = match[1]
          const name = match[2]
          if (appliedMigrations.filter(v => v.timestamp === timestamp && v.name === name).length > 0) {
            console.log(`\tSkipping migration "${migrationFile}"...`)
            continue
          }

          try {
            const contents = await readFile(`${this.migrationsDir}/${schemaFolder}/${migrationFile}`, 'utf8')
            const migration = contents.split(/\nEXIT/im).shift()
            if (!migration) {
              throw new Error(`Empty migration`)
            }
            await this.mysqlClient.query(pool, migration)
            await this.mysqlClient.query(pool, 'INSERT INTO `Migrations` (`timestamp`, `name`) VALUES (?, ?)', [
              timestamp,
              name
            ])
          } catch (e) {
            throw new Error(`Failed applying migration "${this.migrationsDir}/${schemaFolder}/${migrationFile}: ${e}"`)
          }
          if (until && until <= timestamp) {
            console.log(`Stopping at "${this.migrationsDir}/${schemaFolder}/${migrationFile}`)
            break
          }
        }
      }
    }
  }
}
