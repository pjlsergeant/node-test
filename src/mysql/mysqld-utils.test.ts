import { CommandEmulation, createTempDirectory } from '../unix'
import {
  generateMySQLServerConfig,
  getMySQLServerConfig,
  getMySQLServerVersionString,
  startMySQLd
} from './mysqld-utils'
import { mysqlHelpVerboseText } from './resources/mysqld-help-verbose.text'
import { mysqlStartText } from './resources/mysqld-start.text'

describe('mysql common', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  describe('generateMySQLServerConfig', () => {
    it('should generate generic config', async () => {
      const config = generateMySQLServerConfig('/tmp/test', {}, '/tmp')
      expect(config).toMatchSnapshot()
    })

    it('should set user to mysql', async () => {
      const config = generateMySQLServerConfig('/tmp/test', { mysqld: { user: 'mysql' } }, '/tmp')
      expect(config).toMatchSnapshot()
    })
  })

  describe('getMySQLServerVersionString', () => {
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
    it('should return the current mysql config', async () => {
      await commandEmulation.registerCommand(
        'mysqld',
        data => {
          console.log(data)
        },
        null,
        mysqlHelpVerboseText
      )
      const mysqldConfigPromise = getMySQLServerConfig('mysqld', '/tmp/test')
      await expect(mysqldConfigPromise).resolves.toMatchSnapshot()
    })
  })

  describe('startMySQLd', () => {
    it('it should start a detached mysqld server and get the pid', async () => {
      await commandEmulation.registerCommand(
        'mysqld',
        data => {
          console.error(data)
        },
        null,
        mysqlStartText
      )
      const tmpDir = await createTempDirectory()
      const mysqlStartPromise = startMySQLd('mysqld', tmpDir, [`--port=56923`])
      await expect(mysqlStartPromise).resolves.toBeGreaterThan(0)
    }, 10000)
  })
})
