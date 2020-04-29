import { createTempDirectory, RunProcess } from '../src/unix'

describe('local-mysql', () => {
  const processCleanup: Array<RunProcess> = []
  afterEach(async () => {
    // Make sure all process are stopped
    for (const process of processCleanup) {
      await process.stop()
    }
  })

  it(`should start a local mysqld without any options`, async () => {
    const tmpdir = await createTempDirectory()
    const cmd = new RunProcess('local-mysql', [])
    processCleanup.push(cmd)
    await expect(cmd.waitForOutput(/mysqld: ready for connections/)).resolves.toMatchObject({
      0: 'mysqld: ready for connections'
    })
    await cmd.kill('SIGTERM')
    await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
  }, 10000)

  it(`should start a local mysqld and stop it on SIGTERM`, async () => {
    const tmpdir = await createTempDirectory()
    const cmd = new RunProcess('local-mysql', [`--mysqlBaseDir=${tmpdir}`])
    processCleanup.push(cmd)
    await expect(cmd.waitForOutput(/mysqld: ready for connections/)).resolves.toMatchObject({
      0: 'mysqld: ready for connections'
    })
    await cmd.kill('SIGTERM')
    await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
  }, 10000)

  it(`should start a local mysqld and stop it on SIGINT`, async () => {
    const tmpdir = await createTempDirectory()
    const cmd = new RunProcess('local-mysql', [`--mysqlBaseDir=${tmpdir}`])
    processCleanup.push(cmd)
    await expect(cmd.waitForOutput(/mysqld: ready for connections/)).resolves.toMatchObject({
      0: 'mysqld: ready for connections'
    })
    await cmd.kill('SIGINT')
    await expect(cmd.waitForExit()).resolves.toEqual({ code: 0, signal: null })
  }, 10000)

  it(`should start a process and migrate to newest version`, async () => {
    const tmpdir = await createTempDirectory()
    const cmd = new RunProcess('local-mysql', [
      `--mysqlBaseDir=${tmpdir}`,
      `--migrationsDir='src/mysql/resources/migrations'`
    ])
    const data: Buffer[] = []
    cmd.stdout?.on('data', chunk => {
      data.push(chunk)
    })
    cmd.stderr?.on('data', chunk => {
      data.push(chunk)
    })

    processCleanup.push(cmd)
    await expect(cmd.waitForOutput(/mysqld: ready for connections/)).resolves.toMatchObject({
      0: 'mysqld: ready for connections'
    })
    expect(Buffer.concat(data).toString('utf8')).toMatch(/Running migrations/s)
  }, 10000)
})
