#!/usr/bin/env node

import { Migrate } from './mysql/migrate'
import { MySQLClient } from './mysql/mysql-client'
import { MySQLServer } from './mysql/mysql-server'

async function time<T>(promise: Promise<T>): Promise<[T, number]> {
  const start = process.hrtime()
  const result = await promise
  const diff = process.hrtime(start)
  return [result, diff[0] * 1000000 + diff[1] / 1000]
}

async function main(argv: string[]): Promise<number> {
  const mySqlServer = new MySQLServer()
  const mySqlClient = new MySQLClient({ port: await mySqlServer.getListenPort() })
  const migrate = new Migrate({ mysqlClient: mySqlClient, migrationsDir: 'data/migrations' })
  const [_, timingBefore] = await time(migrate.migrate())
  console.log(timingBefore / 1000)
  await migrate.cacheSchemas()
  return 0
}
main(process.argv)
  .then(exitCode => {
    process.exit(exitCode)
  })
  .catch(e => {
    console.error(e)
  })
