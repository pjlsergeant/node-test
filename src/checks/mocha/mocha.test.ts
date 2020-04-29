/* eslint-disable @typescript-eslint/camelcase */
import { CheckResult } from '../checks-common'
import { mochaCheck } from './mocha'
import { mochaFailedOutput, mochaSuccesfulOutput } from './resources/mocha-help-text'

describe('checks/mocha', () => {
  it('processes passing mocha output to checks structure', () => {
    const data = JSON.parse(mochaSuccesfulOutput)

    const output = mochaCheck({
      data,
      org: 'connectedcars',
      repo: 'cloudbuilder-wrapper',
      sha: 'c61a4ae014360e064eb2a9f76c8a6a55d05e5b88'
    })
    const expected = {
      conclusion: 'success',
      output: {
        title: 'mocha',
        summary: 'Found **0** failed tests (**2787** passing)',
        annotations: []
      }
    }
    expect(output).toStrictEqual(expected)
  })

  it('processes failing mocha output to checks structure', () => {
    const data = mochaFailedOutput

    const output = mochaCheck({
      data,
      org: 'connectedcars',
      repo: 'cloudbuilder-wrapper',
      sha: 'c61a4ae014360e064eb2a9f76c8a6a55d05e5b88'
    })
    expect(output).toMatchSnapshot()
  })
})
