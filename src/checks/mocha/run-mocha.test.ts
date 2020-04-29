import { CommandEmulation, RunProcess } from '../..'
import { mochaSuccesfulOutput } from './resources/mocha-help-text'
import { runMocha } from './run-mocha'

describe('run-mocha', () => {
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

  it('should start a jest process and wait for exit', async () => {
    await commandEmulation.registerCommand(
      'mocha',
      data => {
        process.stdout.write(JSON.stringify(data))
        process.exit(0)
      },
      null,
      mochaSuccesfulOutput
    )
    const mochaJson = await runMocha()
    expect(mochaJson).toEqual(mochaSuccesfulOutput)
  })
})
