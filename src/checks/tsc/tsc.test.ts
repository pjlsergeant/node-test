/* tsc-disable @typescript-tsc/camelcase */
import { tscErrorOutput, tscMultiErrorOutput, tscSuccesfulOutput } from './resources/tsc-help-text'
import { parseTsc } from './run-tsc'
import { tscCheck } from './tsc'

describe('checks/tsc', () => {
  it('converts successful tsc', () => {
    const data = parseTsc(tscSuccesfulOutput)
    const result = tscCheck({
      data
    })
    expect(result).toStrictEqual({
      conclusion: 'success',
      output: {
        title: 'No problems found',
        summary: 'No problems found',
        annotations: []
      }
    })
  })

  it('converts successful failed tsc', () => {
    const data = parseTsc(tscErrorOutput)
    const result = tscCheck({
      data
    })
    expect(result).toMatchSnapshot()
  })

  it('converts successful failed tsc with multi errors', () => {
    const data = parseTsc(tscMultiErrorOutput)
    const result = tscCheck({
      data
    })
    expect(result).toMatchSnapshot()
  })
})
