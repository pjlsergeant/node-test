export interface AuditData {
  actions: Action[]
  advisories: Advisories
  metadata: AuditMetadata
  runId: string
}

export interface Action {
  action: string
  module: string
  depth: number
  target: string
}

interface AuditMetadata {
  vulnerabilities: Vulnerabilities
  dependencies: number
  devDependencies: number
  optionalDependencies: number
  totalDependencies: number
}

interface Advisories {
  [key: string]: Advisory
}

export interface Advisory {
  findings: Finding[]
  id: number
  url: string
  module_name: string
  title: string
  overview: string
  severity: string
  vulnerable_versions: string
  recommendation: string
}

interface Finding {
  paths: string[]
  dev: string
}

export interface Vulnerabilities {
  [key: string]: number
}
