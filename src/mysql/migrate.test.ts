import { Migrate } from './migrate'
import { MySQLClient } from './mysql-client'
import { MySQLServer } from './mysql-server'

async function time<T>(promise: Promise<T>): Promise<[T, number]> {
  const start = process.hrtime()
  const result = await promise
  const diff = process.hrtime(start)
  return [result, diff[0] * 1000000 + diff[1] / 1000]
}

describe('Migrate', () => {
  let mySqlClient: MySQLClient
  beforeAll(async () => {
    const mySqlServer = new MySQLServer({ mysqlBaseDir: 'mysql-context' })
    mySqlClient = new MySQLClient({ port: await mySqlServer.getListenPort() })
  })

  afterEach(async () => {
    await mySqlClient?.cleanup()
  })

  it('Query test', async () => {
    const migrate = new Migrate({ mysqlClient: mySqlClient, migrationsDir: 'src/mysql/resources/migrations' })
    await migrate.cleanup()
    await time(migrate.run('2020-04-02T165700'))

    const pool = await mySqlClient.getConnectionPool('my_test01')
    const columnsBefore = await mySqlClient.queryArray<string>(
      pool,
      `
        SELECT COLUMN_NAME AS 'column'
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA ='my_test01' AND TABLE_NAME='VehicleInfo';
      `
    )
    expect(columnsBefore).toMatchObject(['id', 'vin', 'vendor', 'make', 'name', 'year', 'createdAt', 'updatedAt'])

    await migrate.run()
    const columnsAfter = await mySqlClient.queryArray<string>(
      pool,
      `
        SELECT COLUMN_NAME AS 'column'
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA ='my_test01' AND TABLE_NAME='VehicleInfo';
      `
    )
    expect(columnsAfter).toMatchObject([
      'id',
      'vin',
      'vendor',
      'make',
      'name',
      'model',
      'year',
      'createdAt',
      'updatedAt'
    ])
  })
})
