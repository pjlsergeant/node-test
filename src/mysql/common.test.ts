import { CommandEmulation } from '../unix'
import { generateMySQLServerConfig, getMySQLServerConfig, getMySQLServerVersionString } from './common'
import { mysqlHelpVerbose } from './resources/mysqld-help-verbose.text'

describe('generateMySQLServerConfig', () => {
  it('should generate generic config', async () => {
    const config = generateMySQLServerConfig('/tmp/test')
    expect(config).toMatchSnapshot()
  })

  it('should set user to mysql', async () => {
    const config = generateMySQLServerConfig('/tmp/test', { mysqld: { user: 'mysql' } })
    expect(config).toMatchSnapshot()
  })
})

describe('getMySQLServerVersionString', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    //await commandEmulation.cleanup()
  })

  it('should return the version string', async () => {
    await commandEmulation.registerCommand('mysqld', () => {
      console.log('/usr/local/Cellar/mysql/8.0.17_1/bin/mysqld  Ver 8.0.17 for osx10.14 on x86_64 (Homebrew)')
    })
    const versionStringPromise = getMySQLServerVersionString('mysqld')
    await expect(versionStringPromise).resolves.toEqual(
      '/usr/local/Cellar/mysql/8.0.17_1/bin/mysqld  Ver 8.0.17 for osx10.14 on x86_64 (Homebrew)'
    )
  })

  it('should return an error', async () => {
    await commandEmulation.registerCommand('mysqld', () => {
      process.exit(1)
    })
    const versionStringPromise = getMySQLServerVersionString('mysqld')
    await expect(versionStringPromise).rejects.toEqual(new Error('mysqld --version returned non 0 exit code:\n'))
  })
})

describe('getMySQLServerConfig', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  it('should return the current mysql config', async () => {
    await commandEmulation.registerCommand(
      'mysqld',
      data => {
        console.log(data)
      },
      null,
      mysqlHelpVerbose
    )
    const mysqldConfigPromise = getMySQLServerConfig('mysqld', '/tmp/test')
    await expect(mysqldConfigPromise).resolves.toMatchSnapshot()
  })
})
