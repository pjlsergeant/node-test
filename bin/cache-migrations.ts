#!/usr/bin/env node

import { Migrate } from '../src/mysql/migrate'
import { MySQLClient } from '../src/mysql/mysql-client'
import { MySQLServer } from '../src/mysql/mysql-server'
import { createTempDirectory } from '../src/unix'

async function time<T>(promise: Promise<T>): Promise<[number, T]> {
  const start = process.hrtime()
  const result = await promise
  const diff = process.hrtime(start)
  return [diff[0] * 1000000 + diff[1] / 1000, result]
}

async function main(argv: string[]): Promise<number> {
  const cleanup: MySQLServer[] = []
  try {
    const tmpDir = await createTempDirectory()
    console.log(`Run folder: ${tmpDir}`)

    const mySqlServer = new MySQLServer({ mysqlBaseDir: tmpDir, ignoreCache: true })
    cleanup.push(mySqlServer)
    const [mysqlServerTiming] = await time(mySqlServer.waitForStarted())
    console.log(`mysqld no cache start: ${mysqlServerTiming / 1000}`)

    const mySqlClient = new MySQLClient({ port: await mySqlServer.getListenPort() })
    const migrate = new Migrate({ mysqlClient: mySqlClient, migrationsDir: 'data/migrations', ignoreCache: true })
    const [migrationTiming] = await time(migrate.migrate())
    console.log(`migration: ${migrationTiming / 1000}`)

    const [cacheTiming] = await time(migrate.cacheSchemas())
    console.log(`schema cache: ${cacheTiming / 1000}`)

    const [snapshotTiming] = await time(mySqlServer.saveAsCustomInitState())
    console.log(`custom init snapshot: ${snapshotTiming / 1000}`)

    const testCleanMySqlServer = new MySQLServer({ ignoreCustomCache: true })
    cleanup.push(testCleanMySqlServer)
    const [testCleanMysqlServerTiming] = await time(testCleanMySqlServer.waitForStarted())
    console.log(`mysqld clean start: ${testCleanMysqlServerTiming / 1000}`)

    const testCustomMySqlServer = new MySQLServer()
    cleanup.push(testCustomMySqlServer)
    const [testCustomMysqlServerTiming] = await time(testCustomMySqlServer.waitForStarted())
    console.log(`mysqld custom start: ${testCustomMysqlServerTiming / 1000}`)
  } finally {
    for (const server of cleanup) {
      await server.kill()
    }
  }

  return 0
}

main(process.argv)
  .then(exitCode => {
    process.exit(exitCode)
  })
  .catch(e => {
    console.error(e)
  })
