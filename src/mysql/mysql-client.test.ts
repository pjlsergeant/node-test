import { MySQLClient } from './mysql-client'
import { MySQLServer } from './mysql-server'

describe('MySQLClient', () => {
  let mySqlClient: MySQLClient
  beforeAll(async () => {
    const mySqlServer = new MySQLServer({ mysqlBaseDir: 'mysql-context' })
    mySqlClient = new MySQLClient({ port: await mySqlServer.getListenPort() })
  }, 15000)

  afterEach(async () => {
    await mySqlClient?.cleanup()
  })

  it('should create a copy of mysql database and return the name', async () => {
    const database = await mySqlClient.createDatabaseCopy('mysql')
    const pool = await mySqlClient.getConnectionPool(database)
    const users = await mySqlClient.query<{ user: string }>(pool, `SELECT CONCAT(user, '@', host) AS user FROM user;`)
    expect(users.length).toBeGreaterThan(0)
  })

  it('should compare two tables', async () => {
    const database = await mySqlClient.createDatabaseCopy('mysql')
    const pool = await mySqlClient.getConnectionPool(database)
    await expect(mySqlClient.compareTables(pool, 'mysql', 'user', database, 'user')).resolves.toEqual(true)
    await expect(mySqlClient.compareTables(pool, 'mysql', 'db', database, 'user')).resolves.toEqual(false)
  })

  it('should compare two database', async () => {
    const database = await mySqlClient.createDatabaseCopy('mysql')
    const pool = await mySqlClient.getConnectionPool(database)
    await expect(mySqlClient.compareDatabases(pool, 'mysql', database)).resolves.toEqual(true)
    await expect(mySqlClient.compareDatabases(pool, 'db', database)).resolves.toEqual(false)
  })
})
