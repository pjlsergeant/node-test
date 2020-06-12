/* eslint-disable @typescript-eslint/camelcase */

import { FormattedTestResults } from '@jest/test-result/build/types'

import { CheckResult } from '../checks-common'
import { jestCheck } from './jest'
import { jestFailedOutput, jestPassedOutput } from './resources/jest-help-text'

describe('checks/jest', () => {
  it('processes passing jest output to checks structure', () => {
    const data = JSON.parse(jestPassedOutput)

    const output = jestCheck({ data, org: 'connectedcars', repo: 'mobile-app', sha: '1234567890' })
    const expected = {
      conclusion: 'success',
      output: {
        title: '33 of 33 tests passed!',
        summary: '33 of 33 tests passed!',
        annotations: []
      }
    }
    expect(output).toStrictEqual(expected)
  })

  it('processes failing jest output to checks structure', () => {
    const data = JSON.parse(jestFailedOutput)

    const output = jestCheck({ data, org: 'connectedcars', repo: 'mobile-app', sha: '1234567890' })
    const expected: CheckResult = {
      conclusion: 'failure',
      output: {
        title: '3 of 4 tests passed!',
        summary: '3 of 4 tests passed!',
        annotations: [
          {
            start_line: 1,
            end_line: 1,
            annotation_level: 'failure',
            message:
              'Error: expect(received).toStrictEqual(expected) // deep equality\n\n- Expected - 1\n+ Received + 1\n\n Object {\n "conclusion": "success",\n "output": Object {\n "annotations": Array [],\n "summary": "No problems found",\n- "title": "No problems found BUG",\n+ "title": "No problems found",\n },\n }\n at Object.<anonymous> (/home/jagdos/repos/node-ci-tools/src/eslint/eslint.test.ts:61:18)\n at Object.asyncJestTest (/home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/jasmineAsyncInstall.js:100:37)\n at /home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/queueRunner.js:45:12\n at new Promise (<anonymous>)\n at mapper (/home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/queueRunner.js:28:19)\n at /home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/queueRunner.js:75:41',
            path: 'src/eslint/eslint.test.ts',
            blob_href: 'https://github.com/connectedcars/mobile-app/blob/1234567890/src/eslint/eslint.test.ts',
            raw_details:
              '{\n  "ancestorTitles": [],\n  "failureMessages": [\n    "Error: expect(received).toStrictEqual(expected) // deep equality\\n\\n- Expected - 1\\n+ Received + 1\\n\\n Object {\\n \\"conclusion\\": \\"success\\",\\n \\"output\\": Object {\\n \\"annotations\\": Array [],\\n \\"summary\\": \\"No problems found\\",\\n- \\"title\\": \\"No problems found BUG\\",\\n+ \\"title\\": \\"No problems found\\",\\n },\\n }\\n at Object.<anonymous> (/home/jagdos/repos/node-ci-tools/src/eslint/eslint.test.ts:61:18)\\n at Object.asyncJestTest (/home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/jasmineAsyncInstall.js:100:37)\\n at /home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/queueRunner.js:45:12\\n at new Promise (<anonymous>)\\n at mapper (/home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/queueRunner.js:28:19)\\n at /home/jagdos/repos/node-ci-tools/node_modules/jest-jasmine2/build/queueRunner.js:75:41"\n  ],\n  "fullName": "converts successful eslint with skipped file",\n  "location": null,\n  "status": "failed",\n  "title": "converts successful eslint with skipped file",\n  "file": "/home/jagdos/repos/node-ci-tools/src/eslint/eslint.test.ts"\n}'
          }
        ]
      }
    }

    expect(output).toStrictEqual(expected)
  })

  it('handles empty input', () => {
    const sampleOutput = ''
    const output = jestCheck({
      data: (sampleOutput as unknown) as FormattedTestResults,
      org: 'connectedcars',
      repo: 'mobile-app',
      sha: '1234567890'
    })
    const expected = {
      conclusion: 'neutral',
      output: {
        title: 'No tests found',
        summary: 'No tests found',
        annotations: []
      }
    }
    expect(output).toStrictEqual(expected)
  })
})
