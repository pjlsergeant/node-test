/* eslint-disable @typescript-eslint/camelcase */
import { Annotation, CheckResult, GitData, Level } from '../checks-common'

export interface EslintInput extends GitData {
  data: EslintData[]
}

const generateSummary = (errors: number, warnings: number): string => {
  const problems = errors + warnings
  if (!problems) {
    return 'No problems found'
  }

  const summary = `Found ${problems} ${problems === 1 ? 'problem' : 'problems'}`

  const details = []
  if (errors > 0) {
    details.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`)
  }

  if (warnings > 0) {
    details.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`)
  }

  return `${summary} (${details.join(', ')})`
}

export const eslintCheck = ({ data, org, repo, sha }: EslintInput): CheckResult => {
  let errors = 0
  let warnings = 0
  const annotations: Annotation[] = []
  // Run through each file
  outer: for (const file of data) {
    // Run through each message for file
    for (const message of file.messages) {
      if (message.message === 'File ignored because of a matching ignore pattern. Use "--no-ignore" to override.') {
        continue outer
      }
      const match = file.filePath.match(/^.*\/(src\/.+)$/)
      const relPath = match && match.length === 2 ? match[1] : ''
      // Determine severity of message
      let annotation_level: Level = 'notice'
      switch (message.severity) {
        case 1:
          annotation_level = 'warning'
          break
        case 2:
          annotation_level = 'failure'
          break
      }
      // Generate an annotation
      annotations.push({
        path: relPath,
        blob_href: `https://github.com/${org}/${repo}/blob/${sha}/${relPath}`,
        start_line: message.line,
        end_line: message.endLine,
        annotation_level,
        message: `${message.line}:${message.column}`.padEnd(10) + message.message,
        raw_details: JSON.stringify(message, null, '    ')
      })
    }
    // Increment problem counts
    errors += file.errorCount
    warnings += file.warningCount
  }

  const summary = generateSummary(errors, warnings)

  const result: CheckResult = {
    conclusion: 'success',
    output: {
      title: summary,
      summary,
      annotations
    }
  }

  if (errors > 0) {
    result.conclusion = 'failure'
    return result
  }

  if (warnings > 0) {
    result.conclusion = 'neutral'
    return result
  }

  return result
}
