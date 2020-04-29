/* eslint-disable @typescript-eslint/camelcase */
import { Annotation, CheckResult, GitData } from '../checks-common'

export interface MochaInput extends GitData {
  data: MochaData
}

export const mochaCheck = ({ data, org, repo, sha }: MochaInput): CheckResult => {
  const annotations: Annotation[] = []

  // This happens when a test logs something to stdout while running
  if (!data || !data.failures) {
    return {
      conclusion: 'neutral',
      output: {
        title: 'No tests found',
        summary: 'No tests found',
        annotations: []
      }
    }
  }

  // Run through each failed test to create annotations
  for (const test of data.failures) {
    if (!test.err?.stack) {
      continue
    }
    // Find file path from stack
    const matches = test.err.stack.match(/Context\.(?:<anonymous>|it) \((.+)\)/s)
    if (!matches) {
      console.log('fail', test.err.stack)
      continue
    }
    const [filePath, line, column] = matches[1].split(':')
    const lineNumber = parseInt(line)
    // Render GitHub file path from file path
    const blob_href = `http://github.com/${org}/${repo}/blob/${sha}/${filePath}`
    // Generate an annotation
    annotations.push({
      path: filePath,
      blob_href: blob_href,
      start_line: lineNumber,
      end_line: lineNumber,
      annotation_level: 'failure',
      message: `${line}:${column}`.padEnd(10) + `${test.title} ${test.err.message}`,
      title: `${filePath}#L${line}`,
      raw_details: JSON.stringify(test, null, '    ')
    })
  }
  // Generate a summary of the problems
  const failing = data.stats.failures
  const passing = data.stats.passes
  const pending = data.stats.pending
  let summary = `Found **${failing}** failed ${failing === 1 ? 'test' : 'tests'}`
  const details = [`**${passing}** passing`]
  if (pending > 0) {
    details.push(`**${pending}** pending`)
  }
  summary += ` (${details.join(', ')})`
  return {
    conclusion: failing > 0 ? 'failure' : 'success',
    output: {
      title: 'mocha',
      summary,
      annotations
    }
  }
}
