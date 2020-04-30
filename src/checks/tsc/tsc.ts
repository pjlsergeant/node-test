/* eslint-disable @typescript-eslint/camelcase */
import { CheckResult } from '../checks-common'

export interface TscInput {
  data: TscData[]
}

export const tscCheck = ({ data }: TscInput): CheckResult => {
  const result: CheckResult = {
    conclusion: 'success',
    output: {
      summary: 'No problems found',
      title: 'No problems found',
      annotations: []
    }
  }

  if (data && data.length > 0) {
    result.conclusion = 'failure'
    result.output.summary = `${data.length} error(s) found`
    result.output.title = result.output.summary

    result.output.annotations = data.map(err => {
      const relPath = err.file

      return {
        start_line: err.line,
        end_line: err.line,
        annotation_level: 'failure',
        message: err.message,
        path: relPath,
        raw_details: JSON.stringify(err, null, 2)
      }
    })
  }

  return result
}
