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
  let tmpDir = ''
  beforeAll(async () => {
    tmpDir = await createTempDirectory()
  })

  it('Should start a new database server in a tmp folder', async () => {
    let mySqlServer: MySQLServer | null = null
    let connection: mysql.Connection | null = null
    try {
      mySqlServer = new MySQLServer({ mysqlBaseDir: tmpDir })
      const connectionUrl = await mySqlServer.getConnectionUrl('mysql')
      console.log(await mySqlServer.getTimings())
      connection = mysql.createConnection(connectionUrl)
      const result = await query<SimpleResult>(connection, 'SELECT 1 + 1 AS solution')
      expect(result).toMatchObject([{ solution: 2 }])
    } finally {
      connection?.end()
      await mySqlServer?.kill()
    }
  }, 10000)

  it('Should start a new database server from pre created data and resume it after', async () => {
    let mySqlServer: MySQLServer | null = null
    let connection: mysql.Connection | null = null
    try {
      // Do initial mysql start
      mySqlServer = new MySQLServer({ mysqlBaseDir: tmpDir })
      await mySqlServer.getListenPort()
      await expect(mySqlServer.getInitStatus()).resolves.toEqual('started')
      console.log(await mySqlServer.getTimings())

      // Start mysql again letting it pickup the pid
      mySqlServer = new MySQLServer({ mysqlBaseDir: tmpDir })
      await expect(mySqlServer.getInitStatus()).resolves.toEqual('resumed')

      const connectionUrl = await mySqlServer.getConnectionUrl('mysql')
      connection = mysql.createConnection(connectionUrl)
      const result = await query<SimpleResult>(connection, 'SELECT 1 + 1 AS solution')
      expect(result).toMatchObject([{ solution: 2 }])
    } finally {
      connection?.end()
      await mySqlServer?.kill()
    }
  }, 15000)
})
