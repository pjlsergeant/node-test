/* eslint-disable @typescript-eslint/camelcase */
import { eslintCheck } from './eslint'
import {
  eslintErrorAnnotationsOutput,
  eslintErrorOutput,
  eslintSkippedOutput,
  eslintSuccesfulOutput
} from './resources/eslint-help-text'

describe('checks/eslint', () => {
  it('converts successful eslint', () => {
    const data = JSON.parse(eslintSuccesfulOutput)
    const result = eslintCheck({
      data,
      org: 'connectedcars',
      repo: 'cloudbuilder-wrapper',
      sha: 'c61a4ae014360e064eb2a9f76c8a6a55d05e5b88'
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

  it('converts successful failed eslint', () => {
    const data = JSON.parse(eslintErrorOutput)
    const result = eslintCheck({
      data,
      org: 'connectedcars',
      repo: 'cloudbuilder-wrapper',
      sha: 'c61a4ae014360e064eb2a9f76c8a6a55d05e5b88'
    })
    expect(result).toStrictEqual({
      conclusion: 'failure',
      output: {
        title: 'Found 1 problem (1 error)',
        summary: 'Found 1 problem (1 error)',
        annotations: []
      }
    })
  })

  it('converts successful failed eslint with annotations', () => {
    const data = JSON.parse(eslintErrorAnnotationsOutput)
    const result = eslintCheck({
      data,
      org: 'connectedcars',
      repo: 'cloudbuilder-wrapper',
      sha: 'c61a4ae014360e064eb2a9f76c8a6a55d05e5b88'
    })
    expect(result).toStrictEqual({
      conclusion: 'failure',
      output: {
        title: 'Found 2 problems (2 errors)',
        summary: 'Found 2 problems (2 errors)',
        annotations: [
          {
            path: 'src/checks/jest/jest.ts',
            blob_href:
              'https://github.com/connectedcars/cloudbuilder-wrapper/blob/c61a4ae014360e064eb2a9f76c8a6a55d05e5b88/src/checks/jest/jest.ts',
            start_line: 26,
            end_line: 26,
            annotation_level: 'failure',
            message: '26:1      Delete `↹`',
            raw_details:
              '{\n    "ruleId": "prettier/prettier",\n    "severity": 2,\n    "message": "Delete `↹`",\n    "line": 26,\n    "column": 1,\n    "nodeType": null,\n    "endLine": 26,\n    "endColumn": 2,\n    "fix": {\n        "range": [\n            679,\n            680\n        ],\n        "text": ""\n    }\n}'
          },
          {
            path: 'src/checks/jest/jest.ts',
            blob_href:
              'https://github.com/connectedcars/cloudbuilder-wrapper/blob/c61a4ae014360e064eb2a9f76c8a6a55d05e5b88/src/checks/jest/jest.ts',
            start_line: 27,
            end_line: 28,
            annotation_level: 'failure',
            message: '27:4      Delete `⏎`',
            raw_details:
              '{\n    "ruleId": "prettier/prettier",\n    "severity": 2,\n    "message": "Delete `⏎`",\n    "line": 27,\n    "column": 4,\n    "nodeType": null,\n    "endLine": 28,\n    "endColumn": 1,\n    "fix": {\n        "range": [\n            701,\n            702\n        ],\n        "text": ""\n    }\n}'
          }
        ]
      }
    })
  })

  it('converts successful skipped eslint', () => {
    const data = JSON.parse(eslintSkippedOutput)
    const result = eslintCheck({
      data,
      org: 'connectedcars',
      repo: 'cloudbuilder-wrapper',
      sha: 'c61a4ae014360e064eb2a9f76c8a6a55d05e5b88'
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

  // it('processes passing jest output to checks structure', () => {
  //   const data = JSON.parse(jestPassedOutput)

  //   const output = jestCheck({ data, org: 'connectedcars', repo: 'mobile-app', sha: '1234567890' })
  //   const expected = {
  //     conclusion: 'success',
  //     output: {
  //       title: '33 of 33 tests passed!',
  //       summary: '33 of 33 tests passed!',
  //       annotations: []
  //     }
  //   }
  //   expect(output).toStrictEqual(expected)
  // })
})
