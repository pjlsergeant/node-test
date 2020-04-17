import { CommandEmulation, RunProcess } from '../..'
import { jestNotFound, jestSuccesfulOutput } from './resources/jest-help-text'
import { runJest, runReactScriptsTest } from './run-jest'

describe('run-jest', () => {
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
      'jest',
      data => {
        process.stdout.write(JSON.stringify(data))
        process.exit(0)
      },
      null,
      jestSuccesfulOutput
    )
    const jestJson = await runJest()
    expect(jestJson).toEqual(jestSuccesfulOutput)
  })

  it('should start a react-scripts test process and wait for exit', async () => {
    await commandEmulation.registerCommand(
      'react-scripts test',
      data => {
        process.stdout.write(JSON.stringify(data))
        process.exit(0)
      },
      null,
      jestSuccesfulOutput
    )
    const jestJson = await runReactScriptsTest()
    expect(jestJson).toEqual(jestSuccesfulOutput)
  })

  it('should handle jest failing to launch', async () => {
    await commandEmulation.registerCommand(
      'react-scripts test',
      data => {
        process.stdout.write(JSON.stringify(data))
        process.exit(1)
      },
      null,
      jestNotFound
    )
    const jestJson = await runReactScriptsTest()
    expect(jestJson).toEqual(jestNotFound)
  })
})
