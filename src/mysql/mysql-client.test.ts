import { MySQLClient } from './mysql-client'
import { MySQLServer } from './mysql-server'

const formatHrDiff = (what: string, diff: [number, number]): string => `${what} ${diff[0]}s ${diff[1] / 1000000}ms`

describe('MySQLServer', () => {
  let mySqlClient: MySQLClient
  beforeAll(async () => {
    const mySqlServer = new MySQLServer({ mysqlBaseDir: 'mysql-context' })
    mySqlClient = new MySQLClient({ port: await mySqlServer.getListenPort() })
  })

  afterEach(async () => {
    await mySqlClient?.cleanup()
  })

  it('Query test', async () => {
    const copyTime = process.hrtime()
    const pool = await mySqlClient.createDatabaseCopy('mysql') // copy time 0s 428.431469ms
    console.log(formatHrDiff('copy time', process.hrtime(copyTime)))
    const users = await mySqlClient.query<{ user: string }>(pool, `SELECT CONCAT(user, '@', host) AS user FROM user;`)
    console.log(users)
  })
})
