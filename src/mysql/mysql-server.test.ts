import mysql from 'mysql'

import { createTempDirectory } from '../unix'
import { MySQLServer } from './mysql-server'

interface SimpleResult {
  solution: number
}

async function query<T>(connection: mysql.Connection, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    connection.query(sql, (error, results) => {
      if (error) {
        return reject(error)
      }
      resolve(results)
    })
  })
}

describe('MySQLServer startup', () => {
  let mySqlServer: MySQLServer | null = null

  afterEach(async () => {
    await mySqlServer?.kill()
  })

  it.skip('Should start a new database server in a tmp folder', async () => {
    // TODO: Add support for getting a cloned database, https://dev.mysql.com/doc/refman/5.7/en/create-table-like.html
    // fx. mySqlServer.getConnectionUrl('mysql') -> 'mysql://.../mysql-test-copy'
    mySqlServer = new MySQLServer()
    let connection: mysql.Connection | null = null
    try {
      const connectionUrl = `mysql://root:@127.0.0.1:${await mySqlServer.getListenPort()}/mysql?charset=utf8mb4&multipleStatements=true`
      connection = mysql.createConnection(connectionUrl)
      const result = await query<SimpleResult>(connection, 'SELECT 1 + 1 AS solution')
      expect(result).toMatchObject([{ solution: 2 }])
    } finally {
      connection?.end()
    }
  }, 10000)

  it.skip('Should start a new database server and resume it after', async () => {
    const tmpDir = await createTempDirectory()

    // Do initial mysql start
    mySqlServer = new MySQLServer({ mysqlBaseDir: tmpDir })
    await mySqlServer.getListenPort()
    await expect(mySqlServer.getInitStatus()).resolves.toEqual('initialized')
    //console.log(await mySqlServer.getTimings())

    // Start mysql again letting it pickup the pid
    mySqlServer = new MySQLServer({ mysqlBaseDir: tmpDir })
    await expect(mySqlServer.getInitStatus()).resolves.toEqual('resumed')

    let connection: mysql.Connection | null = null
    try {
      const connectionUrl = `mysql://root:@127.0.0.1:${await mySqlServer.getListenPort()}/mysql?charset=utf8mb4&multipleStatements=true`
      connection = mysql.createConnection(connectionUrl)
      const result = await query<SimpleResult>(connection, 'SELECT 1 + 1 AS solution')
      expect(result).toMatchObject([{ solution: 2 }])
    } finally {
      connection?.end()
    }
  }, 10000)
})

const formatHrDiff = (what: string, diff: [number, number]): string => `${what} ${diff[0]}s ${diff[1] / 1000000}ms`

describe('MySQLServer', () => {
  const mySqlServer = new MySQLServer({ mysqlBaseDir: 'mysql-context' })

  afterEach(async () => {
    await mySqlServer?.cleanup()
  })

  it('Query test', async () => {
    let pool: mysql.Pool | null = null
    try {
      const copyTime = process.hrtime()
      const database = await mySqlServer.checkout('mysql') // copy time 0s 428.431469ms
      console.log(formatHrDiff('copy time', process.hrtime(copyTime)))
      pool = await mySqlServer.getConnectionPool(database)
      const users = await mySqlServer.query<{ user: string }>(pool, `SELECT CONCAT(user, '@', host) AS user FROM user;`)
      console.log(users)
    } finally {
      pool?.end
    }
  })
})
