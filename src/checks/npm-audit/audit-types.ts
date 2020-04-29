// actions: [],
// advisories: {},
// muted: [],
// metadata: {
//   vulnerabilities: {
//     info: 0,
//     low: 0,
//     moderate: 0,
//     high: 0,
//     critical: 0
//   },
//   dependencies: 2364,
//   devDependencies: 2606,
//   optionalDependencies: 34,
//   totalDependencies: 4982
// },
// runId: 'd558cef6-7061-454e-89d3-ee85181d1dd6'

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

interface Advisory {
  findings: Finding[]
  id: number
  url: string // check this
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
  // info: number
  // low: number
  // moderate: number
  // high: number
  // critical: number
  // all: number
}
