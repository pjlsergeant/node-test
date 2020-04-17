/* eslint-disable @typescript-eslint/camelcase */
import { AssertionResult, FormattedTestResults } from '@jest/test-result/build/types'
import _ from 'lodash'

import { Annotation, CheckResult, GitData } from '../checks-common'

export type JestOutput = FormattedTestResults

export interface JestInput extends GitData {
  data: FormattedTestResults
}

type AssertionSummary = AssertionResult & { file: string }

export const jestCheck = ({ data, org, repo, sha }: JestInput): CheckResult => {
  const result: CheckResult = {
    conclusion: 'neutral',
    output: {
      title: 'No tests found',
      summary: 'No tests found',
      annotations: []
    }
  }

  if (!data) {
	    return result
  }


  result.conclusion = data.success ? 'success' : 'failure'

  result.output.annotations = _(data.testResults)
    .flatMap(results => {
      return results.assertionResults.map(assertionResult => {
        return {
          ...assertionResult,
          file: results.name
        }
      })
    })
    .filter(r => r.status !== 'passed')
    .map<Annotation>(result => {
      const match = result.file.match(/^.*\/(src\/.+)$/)
      const relPath = match && match.length === 2 ? match[1] : ''

      return {
        start_line: 1,
        end_line: 1,
        annotation_level: 'failure',
        message: result.failureMessages?.join('\n') || '',
        path: relPath,
        blob_href: `https://github.com/${org}/${repo}/blob/${sha}/${relPath}`,
        raw_details: JSON.stringify(result, null, 2)
      }
    })
    .value()

  result.output.summary = `${data.numPassedTests} of ${data.numTotalTests} tests passed!`
  // note: check numTotalTestSuites for count?
  result.output.title = result.output.summary

  return result
}
