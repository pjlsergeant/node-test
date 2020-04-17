interface JestData {
  filePath: string
  messages: EslintMessage[]
  errorCount: number
  warningCount: number
  fixableErrorCount: number
  fixableWarningCount: number
  source?: string
}

interface EslintFix {
  range: number[]
  text: string
}

interface EslintMessage {
  ruleId?: string
  fatal?: boolean
  severity: number
  message: string
  line?: number
  endLine?: number
  column?: number
  endColumn?: number
  nodeType?: string | null
  source?: string
  fix?: EslintFix
}
