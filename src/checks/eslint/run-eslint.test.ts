import { CommandEmulation, RunProcess } from '../..'
import { eslintSuccesfulOutput } from './resources/eslint-help-text'
import { runEslint } from './run-eslint'

describe('run-eslint', () => {
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

  it('should start a eslint process and wait for exit', async () => {
    await commandEmulation.registerCommand(
      'eslint',
      data => {
        process.stdout.write(JSON.stringify(data))
        process.exit(0)
      },
      null,
      eslintSuccesfulOutput
    )
    const jestJson = await runEslint()
    expect(jestJson).toEqual(eslintSuccesfulOutput)
  })
})
