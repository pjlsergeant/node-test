/* eslint-disable @typescript-eslint/camelcase */
export interface GitData {
  org: string
  repo: string
  sha: string
}

export interface CheckResult {
  conclusion: Level
  output: CheckOutput
}

export interface CheckOutput {
  title: string
  summary: string
  annotations?: Annotation[]
  text?: string
}

export interface Annotation {
  path: string
  blob_href?: string
  start_line?: number
  end_line?: number
  annotation_level: Level
  message: string
  raw_details: string
  title?: string
}

export type Level = 'success' | 'failure' | 'neutral' | 'notice' | 'warning'

export const printSummary = (checkResult: CheckResult, ci?: boolean): void => {
  console.log(JSON.stringify(checkResult, null, 2))

  const { output } = checkResult

  // Skip the 'human readable' output if we have ci flag
  if (ci) {
    return
  }

  console.log(output.summary)
  const annotations = output.annotations || []
  for (const annotation of annotations) {
    const { annotation_level, message, start_line, end_line, path } = annotation
    let location = ''

    if (path) {
      const lines = start_line && end_line ? ` line ${start_line}:${end_line}` : ''
      location = `(${path}${lines})`
    }

    console.log(`\t- ${annotation_level}: ${message} ${location}`)
  }
}
