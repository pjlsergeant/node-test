import { CommandEmulation, RunProcess, stopPid } from '.'

describe('process', () => {
  const commandEmulation = new CommandEmulation()

  afterAll(async () => {
    await commandEmulation.cleanup()
  })

  const processCleanup: Array<RunProcess> = []
  afterEach(async () => {
    // Make sure all process are stopped
    for (const process of processCleanup) {
      await process.stop()
    }
  })

  it('should handle trying to stop an non-running pid', async () => {
    await commandEmulation.registerCommand('my-hello', () => {
      console.log('Started...')
    })
    const cmd = new RunProcess('my-hello')
    await cmd.waitForExit()

    // Provoke Error: kill ESRCH
    await expect(stopPid(cmd.pid)).resolves.toEqual(false)
  })
})
