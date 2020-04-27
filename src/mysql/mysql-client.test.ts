import { MySQLClient } from './mysql-client'
import { MySQLServer } from './mysql-server'

describe('MySQLClient', () => {
  let mySqlClient: MySQLClient
  let tmpDatabase: string
  beforeAll(async () => {
    const mySqlServer = new MySQLServer({ mysqlBaseDir: 'mysql-context' })
    mySqlClient = new MySQLClient({ port: await mySqlServer.getListenPort() })
    tmpDatabase = await mySqlClient.createTmpDatabase(
      `
        CREATE TABLE VehicleInfo (
          id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
          vin VARCHAR(17) NOT NULL,
          vendor VARCHAR(255) NOT NULL, -- VAG
          make VARCHAR(255) NOT NULL, -- Audi
          name VARCHAR(255) NOT NULL, -- Audi Q2 Sport
          year YEAR(4) NOT NULL, -- 2018
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

          PRIMARY KEY (id),
          UNIQUE KEY vin (vin)
        )
        ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4
        COMMENT 'Basic vehicle information';

        INSERT INTO VehicleInfo (vin, vendor, make, name, year) VALUES ('ABCDEFGHIJ1234567', 'VAG', 'Audi', 'Audi Q2 Sport', 2018);

        CREATE TABLE VehicleInfo2 (
          id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
          vin VARCHAR(17) NOT NULL,
          vendor VARCHAR(255) NOT NULL, -- VAG
          make VARCHAR(255) NOT NULL, -- Audi
          name VARCHAR(255) NOT NULL, -- Audi Q2 Sport
          model VARCHAR(255) NULL,
          year YEAR(4) NOT NULL, -- 2018
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

          PRIMARY KEY (id),
          UNIQUE KEY vin (vin)
        )
        ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4
        COMMENT 'Basic vehicle information';
      `
    )
  }, 15000)

  afterEach(async () => {
    await mySqlClient?.cleanup()
  })

  it('should create a copy of mysql database and return the name', async () => {
    const database = await mySqlClient.createDatabaseCopy(tmpDatabase)
    const pool = await mySqlClient.getConnectionPool(database)
    const vehicle = await mySqlClient.query<{ user: string }>(pool, `SELECT * from VehicleInfo;`)
    expect(vehicle.length).toBeGreaterThan(0)
  })

  it('should compare two equal tables and return true', async () => {
    const pool = await mySqlClient.getConnectionPool(tmpDatabase)
    await expect(
      mySqlClient.compareTable(pool, tmpDatabase, 'VehicleInfo', tmpDatabase, 'VehicleInfo')
    ).resolves.toEqual(true)
  })

  it('should compare two different tables and return', async () => {
    const pool = await mySqlClient.getConnectionPool(tmpDatabase)
    await expect(
      mySqlClient.compareTable(pool, tmpDatabase, 'VehicleInfo', tmpDatabase, 'VehicleInfo2')
    ).resolves.toEqual(false)
  })

  it('should compare two database', async () => {
    const database = await mySqlClient.createDatabaseCopy(tmpDatabase)
    const pool = await mySqlClient.getConnectionPool(database)
    await expect(mySqlClient.compareDatabases(pool, tmpDatabase, database)).resolves.toEqual(true)
    await expect(mySqlClient.compareDatabases(pool, 'mysql', database)).resolves.toEqual(false)
  })

  it('should reuse the checkout', async () => {
    const database1 = await mySqlClient.checkoutDatabase(tmpDatabase)
    await mySqlClient.cleanup()
    const database2 = await mySqlClient.checkoutDatabase(tmpDatabase)
    expect(database1).toEqual(database2)
  })

  it('should make a new checkout because its locked', async () => {
    const database1 = await mySqlClient.checkoutDatabase(tmpDatabase)
    const database2 = await mySqlClient.checkoutDatabase(tmpDatabase)
    expect(database1).not.toEqual(database2)
  })

  it('should make a new checkout because its dirty', async () => {
    const database1 = await mySqlClient.checkoutDatabase(tmpDatabase)
    const myPool = await mySqlClient.getConnectionPool(database1)
    await mySqlClient.query(
      myPool,
      `INSERT INTO VehicleInfo (vin, vendor, make, name, year) VALUES ('ABCDEFGHIJ1234568', 'VAG', 'Audi', 'Audi Q2 Sport', 2018);`
    )
    await mySqlClient.cleanup()
    const database2 = await mySqlClient.checkoutDatabase(tmpDatabase)
    expect(database1).not.toEqual(database2)
  })
})
