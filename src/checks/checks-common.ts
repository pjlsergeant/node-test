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
  blob_href: string
  start_line?: number
  end_line?: number
  annotation_level: Level
  message: string
  raw_details: string
}

export type Level = 'success' | 'failure' | 'neutral' | 'notice' | 'warning'
