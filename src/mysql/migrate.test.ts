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
  }, 30000)

  afterEach(async () => {
    await mySqlClient?.cleanup()
  })

  it('should migrate schema over two migration runs', async () => {
    const migrate = new Migrate({
      mysqlClient: mySqlClient,
      migrationsPaths: ['src/mysql/resources/migrations'],
      ignoreCache: true
    })
    await migrate.cleanup()
    const [migrationResultBefore, timingBefore] = await time(migrate.migrate('2020-04-02T165700'))
    console.log(timingBefore / 1000)
    const pool = await mySqlClient.getConnectionPool('my_test01')
    const columnsBefore = await mySqlClient.queryArray<string>(
      pool,
      `
        SELECT COLUMN_NAME AS 'column'
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA ='my_test01' AND TABLE_NAME='VehicleInfo';
      `
    )
    expect(columnsBefore).toMatchSnapshot()
    expect(migrationResultBefore).toMatchSnapshot()

    const [migrationResultAfter, timingAfter] = await time(migrate.migrate('2020-04-02T165700'))
    console.log(timingAfter / 1000)
    const columnsAfter = await mySqlClient.queryArray<string>(
      pool,
      `
        SELECT COLUMN_NAME AS 'column'
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA ='my_test01' AND TABLE_NAME='VehicleInfo';
      `
    )
    expect(columnsAfter).toMatchSnapshot()
    expect(migrationResultAfter).toMatchSnapshot()
  })

  it('should migrate schema creating cache and use this to restore state when migrating again', async () => {
    // Do initial migration and without using cache
    const initialMigrate = new Migrate({
      mysqlClient: mySqlClient,
      migrationsPaths: ['src/mysql/resources/migrations'],
      ignoreCache: true
    })
    await initialMigrate.cleanup()
    const migrationResultBefore = await initialMigrate.migrate()
    await initialMigrate.cacheSchemas()
    expect(migrationResultBefore).toMatchSnapshot()

    const cachedMigrate = new Migrate({
      mysqlClient: mySqlClient,
      migrationsPaths: ['src/mysql/resources/migrations']
    })

    await cachedMigrate.cleanup()
    const migrationResultAfter = await cachedMigrate.migrate()
    expect(migrationResultAfter).toMatchSnapshot()
  })

  it.skip('should migrate data repo to newest version', async () => {
    const migrate = new Migrate({ mysqlClient: mySqlClient, migrationsPaths: ['data/migrations'] })
    await migrate.cleanup()
    const [migrationResult, timingBefore] = await time(migrate.migrate())
    console.log(timingBefore / 1000)
  }, 60_000)
})
